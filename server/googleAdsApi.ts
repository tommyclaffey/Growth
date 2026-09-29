import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
/* The normaliser is app code (src/data/sources/googleNormalize.ts), loaded
   through Vite at request time -- the same pattern as metaApi. Shapes are
   declared loosely here; the normaliser owns them. */
type Row = Record<string, unknown>;
interface Normalizer {
  normalizeGoogle: (input: {
    customer: Row; campaigns: Row[]; adGroups?: Row[]; ads?: Row[]; metrics: Row[]; now: Date; days: number;
  }) => unknown;
  accountsFrom: (byRoot: { root: string; rows: Row[] }[]) => { id: string; name: string; currency: string; loginCustomerId: string }[];
  googleErrorMessage: (body: unknown, status: number) => string;
}

/**
 * Google Ads API -- the second real data source.
 *
 * GET  /api/google/status    configured? developer token? connected? which account?
 * GET  /api/google/accounts  the ad accounts this sign-in can read (managers expanded)
 * POST /api/google/account   { id, loginCustomerId } -- choose one
 * GET  /api/google/data      180 days of daily performance, as SourceData
 *
 * The OAuth handshake starts at /api/connect/paidSearch (channelOauth.ts) and
 * returns to /api/connect/callback, which calls `exchangeGoogleCode` below.
 *
 * ⚠️ THREE credentials, not two. Google Ads needs the OAuth client (id +
 * secret) AND a developer token from a manager account's API Center. A new
 * token is "test access" -- it can only read TEST accounts until Google grants
 * Basic access. The error for that is translated into plain words.
 *
 * ⚠️ Access tokens last an hour. What is stored is the REFRESH token; a fresh
 * access token is minted per load. Same local-file compromise as Meta and Slack.
 */

const VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v25';
const API = `https://googleads.googleapis.com/${VERSION}`;
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FILE = resolve(process.cwd(), '.google-ads-tokens.local');
const DAYS = 180;

interface Stored {
  refreshToken: string;
  accessToken?: string;
  accessExpiresAt?: number;
  customerId?: string;
  loginCustomerId?: string;
}

function load(): Stored | null {
  try { return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as Stored) : null; } catch { return null; }
}
function store(s: Stored) { writeFileSync(FILE, JSON.stringify(s, null, 2)); }

function client() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must both be set in .env.local');
  return { id, secret };
}

async function tokenCall(params: Record<string, string>) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await r.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (body.error === 'invalid_grant') {
    throw new Error('Your Google sign-in was revoked or has expired. Connect Google Ads again in Settings.');
  }
  if (!r.ok || !body.access_token) throw new Error(body.error_description ?? body.error ?? `Google returned ${r.status}`);
  return body;
}

/**
 * Code → access + refresh token. Called by the OAuth callback. The connect URL
 * asks for access_type=offline and prompt=consent, which is what makes Google
 * return a refresh token every time rather than only on first consent.
 */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<void> {
  const { id, secret } = client();
  const t = await tokenCall({ code, client_id: id, client_secret: secret, redirect_uri: redirectUri, grant_type: 'authorization_code' });
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove Growth from your Google account’s third-party access and connect again.');
  const prev = load();
  store({
    refreshToken: t.refresh_token,
    accessToken: t.access_token,
    accessExpiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    customerId: prev?.customerId,
    loginCustomerId: prev?.loginCustomerId,
  });
}

async function accessToken(s: Stored): Promise<string> {
  if (s.accessToken && (s.accessExpiresAt ?? 0) > Date.now() + 60_000) return s.accessToken;
  const { id, secret } = client();
  const t = await tokenCall({ refresh_token: s.refreshToken, client_id: id, client_secret: secret, grant_type: 'refresh_token' });
  const next = { ...s, accessToken: t.access_token, accessExpiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  store(next);
  return t.access_token!;
}

export function googleApi(): Plugin {
  let norm: Normalizer | null = null;
  return {
    name: 'growth-google-ads-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const n = async () => (norm ??= (await server.ssrLoadModule('/src/data/sources/googleNormalize.ts')) as unknown as Normalizer);

      async function call(path: string, token: string, init: { method?: string; body?: unknown; login?: string } = {}) {
        const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
        if (!dev) throw new Error('GOOGLE_ADS_DEVELOPER_TOKEN is not set in .env.local.');
        const headers: Record<string, string> = {
          authorization: `Bearer ${token}`, 'developer-token': dev, 'content-type': 'application/json',
        };
        if (init.login) headers['login-customer-id'] = init.login;
        const r = await fetch(`${API}/${path}`, {
          method: init.method ?? 'GET', headers, body: init.body ? JSON.stringify(init.body) : undefined,
        });
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error((await n()).googleErrorMessage(body, r.status));
        return body;
      }

      /** searchStream: a JSON ARRAY of batches, each with `results`. Flattened. */
      async function query(customer: string, gaql: string, token: string, login?: string): Promise<Row[]> {
        const batches = await call(`customers/${customer}/googleAds:searchStream`, token,
          { method: 'POST', body: { query: gaql }, login }) as { results?: Row[] }[];
        return (batches ?? []).flatMap((b) => b.results ?? []);
      }

      server.middlewares.use('/api/google', async (req, res) => {
        const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/$/, '');
        const s = load();
        try {
          if (req.method === 'GET' && path === '/status') {
            return send(res, 200, {
              configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
              developerToken: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
              connected: Boolean(s?.refreshToken),
              expired: false,
              accountId: s?.customerId ?? null,
            });
          }
          if (!s?.refreshToken) return send(res, 401, { error: 'Google Ads is not connected. Connect it in Settings.' });
          const token = await accessToken(s);

          if (req.method === 'GET' && path === '/accounts') {
            const { resourceNames = [] } = await call('customers:listAccessibleCustomers', token) as { resourceNames?: string[] };
            const roots = resourceNames.map((r) => r.split('/')[1]);
            const settled = await Promise.allSettled(roots.map(async (root) => ({
              root,
              rows: await query(root, `
                SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code,
                       customer_client.manager, customer_client.status
                FROM customer_client WHERE customer_client.level <= 1`, token, root),
            })));
            const ok = settled.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []));
            /* One cancelled account should not hide the rest; ALL failing is a real error. */
            if (!ok.length && settled.length) throw (settled[0] as PromiseRejectedResult).reason;
            return send(res, 200, { accounts: (await n()).accountsFrom(ok) });
          }

          if (req.method === 'POST' && path === '/account') {
            const { id, loginCustomerId } = await json(req);
            const digits = (v: unknown) => typeof v === 'string' && /^\d{6,12}$/.test(v);
            if (!digits(id) || !digits(loginCustomerId)) return send(res, 400, { error: 'An account id and the manager it was reached through are required.' });
            store({ ...s, customerId: id as string, loginCustomerId: loginCustomerId as string });
            return send(res, 200, { accountId: id });
          }

          if (req.method === 'GET' && path === '/data') {
            if (!s.customerId) return send(res, 409, { error: 'Choose a Google Ads account in Settings.' });
            const cid = s.customerId;
            const login = s.loginCustomerId ?? cid;
            const q = (gaql: string) => query(cid, gaql, token, login);
            /* Wider than needed; the normaliser keeps exactly DAYS ending on the
               last complete day in the account's own timezone. */
            const until = new Date(); const since = new Date(); since.setDate(since.getDate() - DAYS - 2);
            const iso = (d: Date) => d.toISOString().slice(0, 10);
            const during = `segments.date BETWEEN '${iso(since)}' AND '${iso(until)}'`;
            const perf = 'metrics.cost_micros, metrics.impressions, metrics.clicks';
            const conv = 'segments.conversion_action_category, metrics.conversions, metrics.conversions_value';
            const camp = 'campaign.id, campaign.name, campaign.advertising_channel_type';
            const adKeys = `${camp}, ad_group.id, ad_group.name, ad_group_ad.ad.id`;

            const [[customer], campaigns, adGroups, ads, ...metrics] = await Promise.all([
              q('SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer'),
              q(`SELECT ${camp}, campaign.status, campaign.serving_status FROM campaign WHERE campaign.status != 'REMOVED'`),
              q("SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE ad_group.status != 'REMOVED'"),
              q(`SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type,
                        ad_group_ad.status, ad_group_ad.policy_summary.review_status,
                        ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
                        ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_display_ad.descriptions,
                        ad_group_ad.ad.video_responsive_ad.headlines, ad_group_ad.ad.video_responsive_ad.descriptions
                 FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED'`),
              /* Cost and conversions-by-category cannot share a query, and
                 Performance Max has no ads -- so four metric reads. */
              q(`SELECT ${camp}, segments.date, ${perf} FROM campaign WHERE ${during}`),
              q(`SELECT ${camp}, segments.date, ${conv} FROM campaign WHERE ${during}`),
              q(`SELECT ${adKeys}, segments.date, ${perf} FROM ad_group_ad WHERE ${during}`),
              q(`SELECT ${adKeys}, segments.date, ${conv} FROM ad_group_ad WHERE ${during}`),
            ]);
            return send(res, 200, (await n()).normalizeGoogle({
              customer: (customer as { customer?: Row })?.customer ?? {},
              campaigns, adGroups, ads, metrics: metrics.flat(), now: new Date(), days: DAYS,
            }));
          }
          return send(res, 404, { error: 'Unknown Google Ads endpoint.' });
        } catch (e) {
          return send(res, 502, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
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
