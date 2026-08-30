import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Connecting an ad account.
 *
 * Each platform is its own OAuth provider with its own app registration, its
 * own review process and its own scope vocabulary — there is no generic "ad
 * platform" endpoint. So this is a table of providers, not one integration.
 *
 * What it deliberately does NOT do is fake the connection. A Connect button
 * that flips a switch and shows "Synced 4 minutes ago" is the same lie as a
 * dead control: it reports a state that was never established. Without
 * credentials the button says exactly what is missing.
 */

export interface Provider {
  id: string;
  label: string;
  /** Where the person is sent to approve. */
  authorizeUrl: string;
  scopes: string;
  /** Env var holding the client id for this platform. */
  clientIdEnv: string;
  /** Extra query params this provider requires. */
  extra?: Record<string, string>;
  /** Set when the platform has no self-serve OAuth for this kind of data. */
  note?: string;
}

export const PROVIDERS: Record<string, Provider> = {
  meta: {
    id: 'meta',
    label: 'Meta',
    authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    scopes: 'ads_read,read_insights',
    clientIdEnv: 'META_CLIENT_ID',
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    /* YouTube ad data comes through Google, not through YouTube — the account
       being connected is a Google one. */
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: 'https://www.googleapis.com/auth/yt-analytics.readonly',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    extra: { response_type: 'code', access_type: 'offline', prompt: 'consent' },
  },
  paidSearch: {
    id: 'paidSearch',
    label: 'Google Ads',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: 'https://www.googleapis.com/auth/adwords',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    extra: { response_type: 'code', access_type: 'offline', prompt: 'consent' },
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok Ads',
    authorizeUrl: 'https://business-api.tiktok.com/portal/auth',
    scopes: '',
    clientIdEnv: 'TIKTOK_APP_ID',
    /* TikTok names the parameter differently and does not take a scope list in
       the URL — scopes are fixed on the app itself. */
    extra: {},
  },
  affiliates: {
    id: 'affiliates',
    label: 'Affiliates',
    authorizeUrl: '',
    scopes: '',
    clientIdEnv: '',
    note: 'Affiliate data comes from a network — Impact, PartnerStack, Refersion — not from one platform. Pick the network first.',
  },
  podcasts: {
    id: 'podcasts',
    label: 'Podcasts',
    authorizeUrl: '',
    scopes: '',
    clientIdEnv: '',
    note: 'Podcast attribution comes from a host or a tracker — Megaphone, Podscribe, Chartable — not from one platform.',
  },
};

const states = new Map<string, number>();
const TTL = 10 * 60 * 1000;

function page(res: ServerResponse, title: string, body: string) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:15px/1.6 -apple-system,system-ui,sans-serif;padding:48px;max-width:36em;color:#16161c">
<h1 style="font-size:19px;margin:0 0 12px">${title}</h1>
<div style="color:#5a5a68">${body}</div>
<p style="margin-top:24px"><a href="/Growth/" style="color:#635BFF">Back to Growth</a></p>`);
}

export function channelOauth(): Plugin {
  return {
    name: 'growth-channel-oauth',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/connect', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname.replace(/\/$/, '');

        if (req.method === 'GET' && (path === '' || path === '/status')) {
          /* Which platforms could actually be connected from this machine. */
          const out: Record<string, { label: string; ready: boolean; note?: string }> = {};
          for (const [key, p] of Object.entries(PROVIDERS)) {
            out[key] = {
              label: p.label,
              ready: Boolean(p.authorizeUrl && p.clientIdEnv && process.env[p.clientIdEnv]),
              note: p.note,
            };
          }
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ providers: out }));
        }

        const key = path.replace(/^\//, '');
        const provider = PROVIDERS[key];
        if (!provider) return page(res, 'Unknown channel', `No provider is configured for “${key}”.`);

        if (provider.note) {
          return page(res, `${provider.label} has no single provider`, provider.note);
        }

        const clientId = process.env[provider.clientIdEnv];
        if (!clientId) {
          /* Named rather than generic: "not configured" sends someone hunting
             through every file, and the answer is one line in one file. */
          return page(res, `${provider.label} is not set up yet`,
            `Add <code>${provider.clientIdEnv}</code> to <code>.env.local</code> and restart the dev server. ` +
            `You get it by registering an app with ${provider.label}.`);
        }

        const state = randomBytes(16).toString('hex');
        states.set(state, Date.now() + TTL);
        for (const [k, exp] of states) if (exp < Date.now()) states.delete(k);

        const auth = new URL(provider.authorizeUrl);
        auth.searchParams.set('client_id', clientId);
        auth.searchParams.set('redirect_uri', `${url.origin}/api/connect/callback`);
        auth.searchParams.set('state', `${provider.id}:${state}`);
        if (provider.scopes) auth.searchParams.set('scope', provider.scopes);
        for (const [k, v] of Object.entries(provider.extra ?? {})) auth.searchParams.set(k, v);

        res.statusCode = 302;
        res.setHeader('Location', auth.toString());
        return res.end();
      });
    },
  };
}
