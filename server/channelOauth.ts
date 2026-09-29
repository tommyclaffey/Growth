import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { escapeHtml, pathOf } from './http.js';
import { exchangeGoogleCode } from './googleAdsApi.js';
import { exchangeMetaCode } from './metaApi.js';

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
  /** Where you actually go to create the app registration. */
  consoleUrl?: string;
  consoleLabel?: string;
  /** What to do once you are there. */
  steps?: string[];
}

export const PROVIDERS: Record<string, Provider> = {
  meta: {
    id: 'meta',
    label: 'Meta',
    authorizeUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
    scopes: 'ads_read,read_insights',
    clientIdEnv: 'META_CLIENT_ID',
    consoleUrl: 'https://developers.facebook.com/apps',
    consoleLabel: 'Meta for Developers',
    steps: [
      'Create an app, type <b>Business</b>.',
      'Add the <b>Marketing API</b> product.',
      'Under Facebook Login → Settings, add the redirect URI below.',
      'Copy the <b>App ID</b> from Settings → Basic.',
    ],
  },
  youtube: {
    id: 'youtube',
    label: 'YouTube',
    /* YouTube ad data comes through Google, not through YouTube — the account
       being connected is a Google one. */
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: 'https://www.googleapis.com/auth/yt-analytics.readonly',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    consoleLabel: 'Google Cloud Console',
    steps: [
      'Create Credentials → <b>OAuth client ID</b> → Web application.',
      'Enable the <b>YouTube Analytics API</b> for the project.',
      'Add the redirect URI below to Authorised redirect URIs.',
      'Copy the <b>Client ID</b>.',
    ],
    extra: { response_type: 'code', access_type: 'offline', prompt: 'consent' },
  },
  paidSearch: {
    id: 'paidSearch',
    label: 'Google Ads',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: 'https://www.googleapis.com/auth/adwords',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    consoleLabel: 'Google Cloud Console',
    steps: [
      'Same OAuth client as YouTube — one <code>GOOGLE_CLIENT_ID</code> covers both. It also needs <code>GOOGLE_CLIENT_SECRET</code>.',
      'Enable the <b>Google Ads API</b> for the project.',
      'Add the redirect URI below to Authorised redirect URIs.',
      'Google Ads also needs a <b>developer token</b>: a manager account → Admin → <b>API Center</b>. Put it in <code>.env.local</code> as <code>GOOGLE_ADS_DEVELOPER_TOKEN</code>.',
      'A new token has <b>test access</b> — it reads test accounts only. Apply for <b>Basic access</b> there to read real ones.',
    ],
    extra: { response_type: 'code', access_type: 'offline', prompt: 'consent' },
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok Ads',
    authorizeUrl: 'https://business-api.tiktok.com/portal/auth',
    scopes: '',
    clientIdEnv: 'TIKTOK_APP_ID',
    consoleUrl: 'https://business-api.tiktok.com/portal/apps',
    consoleLabel: 'TikTok for Business developer portal',
    steps: [
      'Create an app under <b>My Apps</b>.',
      'Scopes are fixed on the app itself, not requested in the URL — tick the Reporting scopes there.',
      'Add the redirect URI below.',
      'Copy the <b>App ID</b>.',
    ],
    /* TikTok names the parameter differently and does not take a scope list in
       the URL — scopes are fixed on the app itself. */
    extra: {},
  },
  /* Not an ad platform -- a second chat integration beside Slack. It lives in
     this table because the handshake is the same shape (redirect, consent,
     callback) and a second OAuth module would be a second copy of it.

     Microsoft Graph, delegated permissions. ChannelMessage.Read.All needs an
     org admin to consent -- a Teams tenant decides that, not the person
     clicking Connect, which is why the steps say so up front. */
  teams: {
    id: 'teams',
    label: 'Microsoft Teams',
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    scopes: 'offline_access User.Read Team.ReadBasic.All Channel.ReadBasic.All '
      + 'ChannelMessage.Read.All ChannelMessage.Send',
    clientIdEnv: 'MS_CLIENT_ID',
    consoleUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    consoleLabel: 'Microsoft Entra admin center → App registrations',
    steps: [
      '<b>New registration</b>. Supported account types: <b>any organisational directory</b> (multitenant).',
      'Platform <b>Web</b>, and add the redirect URI below.',
      'API permissions → Microsoft Graph → <b>Delegated</b>: User.Read, Team.ReadBasic.All, '
        + 'Channel.ReadBasic.All, ChannelMessage.Read.All, ChannelMessage.Send.',
      '<b>ChannelMessage.Read.All needs admin consent</b> in each Teams organisation that connects.',
      'Copy the <b>Application (client) ID</b>. Later, a client secret for the token exchange.',
    ],
    extra: { response_type: 'code', response_mode: 'query' },
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

/**
 * `new URL(req.url, 'http://localhost')` needs a base to parse a path-only URL,
 * but that base is a placeholder — it is not where the request came from. Using
 * its origin drops the port locally and the whole hostname behind the tunnel,
 * and the redirect_uri has to match the registered one byte for byte, so every
 * provider would reject the handshake.
 */
function originOf(req: { headers: Record<string, unknown> }): string {
  /* 🛑 The Host / X-Forwarded-Host headers are caller-controlled. A fixed
     PUBLIC_ORIGIN wins when set; otherwise the host must at least LOOK like a
     host, or it falls back to localhost -- it is reflected into a page. */
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const raw = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '');
  const host0 = /^[a-z0-9.-]+(:\d+)?$/i.test(raw) ? raw : undefined;
  const host = host0;
  const fwd = req.headers['x-forwarded-proto'];
  const proto = (fwd === 'https' || fwd === 'http' ? fwd : undefined)
    ?? (host && !/^localhost|^127\./.test(host) ? 'https' : 'http');
  return `${proto}://${host ?? 'localhost:5173'}`;
}

/* state → which provider it was minted for, and when it expires. A state is
   only good for the provider that started it. */
const states = new Map<string, { exp: number; id: string }>();
const TTL = 10 * 60 * 1000;

/**
 * These pages are served outside the React app — a full navigation lands here —
 * so they cannot use the app's stylesheet. The palette is duplicated rather
 * than imported, which is a real (small) drift risk; the alternative is a page
 * that looks like a crash at the one moment someone is already unsure whether
 * something is broken.
 */
function page(res: ServerResponse, title: string, body: string) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)} · Growth</title>
<style>
  :root { color-scheme: light }
  body { font: 15px/1.65 -apple-system, system-ui, "Segoe UI", sans-serif;
         margin: 0; padding: 64px 32px; color: #16161C; background: #F7F7FB;
         display: flex; justify-content: center }
  main { width: 100%; max-width: 34rem }
  h1 { font-size: 21px; line-height: 28px; margin: 0 0 4px; letter-spacing: -0.01em }
  .lede { color: #5A5A68; margin: 0 0 24px }
  .card { background: #fff; border: 1px solid #EAEAF1; border-radius: 14px;
          padding: 20px 24px; margin: 0 0 20px }
  ol { margin: 0; padding-left: 20px } li { margin: 0 0 8px } li:last-child { margin: 0 }
  code { font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
         background: #F1F1FA; border-radius: 4px; padding: 2px 6px }
  .label { font-size: 12px; line-height: 16px; font-weight: 500; color: #9A9AA6;
           text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 8px }
  .uri { display: block; word-break: break-all; padding: 10px 12px; background: #F1F1FA;
         border-radius: 8px; font: 13px/1.5 ui-monospace, Menlo, monospace }
  a { color: #635BFF }
  .btn { display: inline-block; text-decoration: none; background: #635BFF; color: #fff;
         padding: 8px 16px; border-radius: 10px; font-weight: 500; font-size: 13px; line-height: 20px }
</style>
<main>
<h1>${escapeHtml(title)}</h1>
${body}
<p style="margin-top:28px"><a class="btn" href="/Growth/">Back to Growth</a></p>
</main>`);
}

export function channelOauth(): Plugin {
  return {
    name: 'growth-channel-oauth',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/connect', async (req, res) => {
        const url = pathOf(req);
        if (!url) { res.statusCode = 400; return res.end(); }
        const path = url.pathname.replace(/\/$/, '');
        const origin = originOf(req as never);

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

        /* The return trip. It used to fall through to "Unknown channel" --
           approve on Meta or Microsoft and land on an error. Saying plainly
           what happened, and what is not built yet, beats that. */
        if (path === '/callback') {
          const [id, state] = (url.searchParams.get('state') ?? '').split(':');
          const minted = state ? states.get(state) : undefined;
          const known = Boolean(minted && minted.exp > Date.now() && minted.id === id);
          const p = Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id] : undefined;
          if (!p || !known) {
            return page(res, 'That link has expired',
              '<p class="lede">The connection request was not recognised or is over ten minutes old. Start again from Settings.</p>');
          }
          states.delete(state);
          if (url.searchParams.get('error')) {
            return page(res, `${p.label} was not connected`,
              `<p class="lede">${p.label} said: ${escapeHtml(url.searchParams.get('error_description') ?? url.searchParams.get('error'))}</p>`);
          }
          /* Meta: finish the handshake for real -- code for a long-lived token,
             stored server-side. The other platforms still stop here. */
          if (p.id === 'meta') {
            try {
              await exchangeMetaCode(url.searchParams.get('code') ?? '', `${origin}/api/connect/callback`);
              return page(res, 'Meta is connected', `
<p class="lede">Growth can now read the ad accounts you have a role on.</p>
<div class="card"><p class="label">Next</p>
<p style="margin:0">In Settings → <b>Data source</b>, choose the ad account, then switch the
product to it.</p></div>`);
            } catch (e) {
              return page(res, 'Meta did not finish connecting', `<p class="lede">${escapeHtml(e instanceof Error ? e.message : String(e))}</p>`);
            }
          }
          if (p.id === 'paidSearch') {
            try {
              await exchangeGoogleCode(url.searchParams.get('code') ?? '', `${origin}/api/connect/callback`);
              return page(res, 'Google Ads is connected', `
<p class="lede">Growth can now read the Google Ads accounts you have access to.</p>
<div class="card"><p class="label">Next</p>
<p style="margin:0">In Settings → <b>Data source</b>, choose the account, then switch the
product to it.</p></div>`);
            } catch (e) {
              return page(res, 'Google Ads did not finish connecting', `<p class="lede">${escapeHtml(e instanceof Error ? e.message : String(e))}</p>`);
            }
          }
          return page(res, `${p.label} approved the connection`, `
<p class="lede">The sign-in worked and ${p.label} returned an authorisation code.</p>
<div class="card"><p class="label">Not built yet</p>
<p style="margin:0">Exchanging that code for a token and storing the connection is the next
step (Beta B). Nothing was saved, and Growth cannot read ${p.label} yet.</p></div>`);
        }

        const key = path.replace(/^\//, '');
        const provider = Object.hasOwn(PROVIDERS, key) ? PROVIDERS[key] : undefined;
        if (!provider) {
          return page(res, 'Unknown channel',
            `<p class="lede">No provider is configured for “${escapeHtml(key)}”.</p>`);
        }

        if (provider.note) {
          return page(res, `${provider.label} has no single provider`,
            `<p class="lede">${provider.note}</p>`);
        }

        const clientId = process.env[provider.clientIdEnv];
        if (!clientId) {
          /* Named rather than generic: "not configured" sends someone hunting
             through every file, and the answer is one line in one file. */
          const redirect = `${origin}/api/connect/callback`;
          const steps = (provider.steps ?? []).map((x) => `<li>${x}</li>`).join('');
          return page(res, `${provider.label} needs an app registration`, `
<p class="lede">Every platform is its own OAuth provider. Growth can\u2019t connect to
${provider.label} until you register an app there and give it the client id.</p>
<div class="card">
  <p class="label">Where</p>
  <p style="margin:0"><a href="${provider.consoleUrl}" target="_blank" rel="noreferrer">${provider.consoleLabel}</a></p>
</div>
${steps ? `<div class="card"><p class="label">What to do there</p><ol>${steps}</ol></div>` : ''}
<div class="card">
  <p class="label">Redirect URI to register</p>
  <code class="uri">${escapeHtml(redirect)}</code>
</div>
<div class="card">
  <p class="label">Then, locally</p>
  <p style="margin:0">Put it in <code>.env.local</code> and restart the dev server:</p>
  <code class="uri" style="margin-top:10px">${provider.clientIdEnv}=your-id-here</code>
</div>`);
        }

        const state = randomBytes(16).toString('hex');
        states.set(state, { exp: Date.now() + TTL, id: provider.id });
        for (const [k, v] of states) if (v.exp < Date.now()) states.delete(k);

        const auth = new URL(provider.authorizeUrl);
        auth.searchParams.set('client_id', clientId);
        auth.searchParams.set('redirect_uri', `${origin}/api/connect/callback`);
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
