import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
/* The normaliser is app code (src/data/sources/metaNormalize.ts), loaded
   through Vite at request time -- the same pattern as assistantApi. A static
   import would pull the whole app into the server's type-check. Shapes are
   declared here to match. */
interface MetaAccount { name: string; currency: string; timezone_name: string }
interface MetaCampaign { id: string; name: string; objective?: string; effective_status?: string }
interface MetaInsight { campaign_id: string; date_start: string; [k: string]: unknown }
interface Normalizer {
  normalizeMeta: (input: {
    account: MetaAccount; campaigns: MetaCampaign[]; insights: MetaInsight[];
    adsets?: unknown[]; ads?: unknown[]; now: Date; days: number;
  }) => unknown;
}

/**
 * Meta Marketing API -- the first real data source (Phase 4).
 *
 * GET  /api/meta/status    configured? connected? which ad account?
 * GET  /api/meta/accounts  the ad accounts this token can read
 * POST /api/meta/account   { id } -- choose one
 * GET  /api/meta/data      180 days of daily campaign performance, as SourceData
 *
 * The OAuth handshake starts at /api/connect/meta (channelOauth.ts) and returns
 * to /api/connect/callback, which calls `exchangeMetaCode` below.
 *
 * ⚠️ Development mode, deliberately: a Meta app in dev mode reads any ad
 * account the signed-in person has a role on, with no App Review. Reading
 * OTHER people's accounts needs review -- that is Beta B's problem, not this.
 *
 * ⚠️ Token storage is a local file (gitignored by *.local), the same compromise
 * as the Slack tokens: fine on one machine, a database before anyone else.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
const FILE = resolve(process.cwd(), '.meta-tokens.local');
/** The product's full history: 90 selectable days + 90 to compare against. */
const DAYS = 180;

interface Stored { accessToken: string; expiresAt?: number; accountId?: string }

function load(): Stored | null {
  try { return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Stored) : null; } catch { return null; }
}
function store(s: Stored) { writeFileSync(FILE, JSON.stringify(s, null, 2)); }

async function graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', token);
  const r = await fetch(url);
  const body = await r.json() as T & { error?: { message: string } };
  if (!r.ok || body.error) throw new Error(body.error?.message ?? `Meta returned ${r.status}`);
  return body;
}

/** Follows `paging.next` until the data runs out -- insights for 180 days of
    many campaigns is several pages, and stopping at the first undercounts. */
async function all<T>(path: string, token: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let page = await graph<{ data: T[]; paging?: { next?: string } }>(path, token, { ...params, limit: '500' });
  out.push(...page.data);
  while (page.paging?.next) {
    const r = await fetch(page.paging.next);
    page = await r.json() as typeof page;
    out.push(...(page.data ?? []));
  }
  return out;
}

/**
 * Code → short-lived token → long-lived token (~60 days). Called by the OAuth
 * callback. Needs META_CLIENT_SECRET, which never leaves the server.
 */
export async function exchangeMetaCode(code: string, redirectUri: string): Promise<void> {
  const id = process.env.META_CLIENT_ID;
  const secret = process.env.META_CLIENT_SECRET;
  if (!id || !secret) throw new Error('META_CLIENT_ID and META_CLIENT_SECRET must both be set in .env.local');
  const short = await graph<{ access_token: string }>('oauth/access_token', '', {
    client_id: id, client_secret: secret, redirect_uri: redirectUri, code,
  });
  const long = await graph<{ access_token: string; expires_in?: number }>('oauth/access_token', '', {
    grant_type: 'fb_exchange_token', client_id: id, client_secret: secret, fb_exchange_token: short.access_token,
  });
  store({
    accessToken: long.access_token,
    expiresAt: long.expires_in ? Date.now() + long.expires_in * 1000 : undefined,
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

export function metaApi(): Plugin {
  return {
    name: 'growth-meta-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/meta', async (req, res) => {
        const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/$/, '');
        const s = load();
        try {
          if (req.method === 'GET' && path === '/status') {
            return send(res, 200, {
              configured: Boolean(process.env.META_CLIENT_ID && process.env.META_CLIENT_SECRET),
              connected: Boolean(s?.accessToken),
              expired: Boolean(s?.expiresAt && s.expiresAt < Date.now()),
              accountId: s?.accountId ?? null,
            });
          }
          if (!s?.accessToken) return send(res, 401, { error: 'Meta is not connected. Connect it in Settings.' });

          if (req.method === 'GET' && path === '/accounts') {
            const accounts = await all<{ id: string; name: string; currency: string; account_status: number }>(
              'me/adaccounts', s.accessToken, { fields: 'id,name,currency,account_status' });
            return send(res, 200, { accounts });
          }
          if (req.method === 'POST' && path === '/account') {
            const { id } = await json(req);
            if (typeof id !== 'string' || !id.startsWith('act_')) return send(res, 400, { error: 'An ad account id (act_…) is required.' });
            store({ ...s, accountId: id });
            return send(res, 200, { accountId: id });
          }
          if (req.method === 'GET' && path === '/data') {
            if (!s.accountId) return send(res, 409, { error: 'Choose a Meta ad account in Settings.' });
            const account = await graph<MetaAccount>(s.accountId, s.accessToken, { fields: 'name,currency,timezone_name' });
            const campaigns = await all<MetaCampaign>(`${s.accountId}/campaigns`, s.accessToken,
              { fields: 'id,name,objective,effective_status' });
            /* A window slightly wider than needed, in the account's own days;
               the normaliser keeps exactly DAYS ending on the last full day. */
            const until = new Date(); const since = new Date(); since.setDate(since.getDate() - DAYS - 2);
            const iso = (d: Date) => d.toISOString().slice(0, 10);
            /* AD level: ad sets and campaigns are built as sums of their ads, so
               the three tiers reconcile by construction. */
            const [adsets, ads, insights] = await Promise.all([
              all<Record<string, unknown>>(`${s.accountId}/adsets`, s.accessToken,
                { fields: 'id,name,campaign_id,effective_status' }),
              all<Record<string, unknown>>(`${s.accountId}/ads`, s.accessToken,
                { fields: 'id,name,adset_id,campaign_id,effective_status,creative{title,body,thumbnail_url,object_type}' }),
              all<MetaInsight>(`${s.accountId}/insights`, s.accessToken, {
                level: 'ad', time_increment: '1',
                fields: 'campaign_id,campaign_name,adset_id,ad_id,spend,impressions,clicks,actions,action_values',
                time_range: JSON.stringify({ since: iso(since), until: iso(until) }),
              }),
            ]);
            const { normalizeMeta } = (await server.ssrLoadModule('/src/data/sources/metaNormalize.ts')) as unknown as Normalizer;
            return send(res, 200, normalizeMeta({ account, campaigns, insights, adsets, ads, now: new Date(), days: DAYS }));
          }
          return send(res, 404, { error: 'Unknown Meta endpoint.' });
        } catch (e) {
          return send(res, 502, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
