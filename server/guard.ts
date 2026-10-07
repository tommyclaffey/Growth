import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { requester, sandboxed } from './auth.js';
import { escapeHtml, pathOf, send } from './http.js';

/**
 * 🛑 THE GATE IN FRONT OF EVERY /api ROUTE.
 *
 * The API holds a real Slack user token and a paid Anthropic key, and the dev
 * server is sometimes public through a Cloudflare tunnel -- whose URL is not a
 * secret: "Open in Growth" links post it into Slack.
 *
 * Three rules, in order:
 *
 *   1. NO CROSS-SITE REQUESTS. A page on any other site can fire a "simple"
 *      POST at localhost:5173 -- CORS stops it reading the answer, not sending
 *      the request. A foreign Origin, or a cross-site fetch, is refused. Top-level
 *      navigations are allowed (that is how OAuth providers send people back).
 *   2. POSTS ARE JSON. A form or text/plain POST is exactly the no-preflight
 *      shape a hostile page uses; the app itself only ever sends JSON.
 *   3. SIGNED IN. Every route needs a session -- on this machine too, since
 *      Sept 29: a login is who you are, and the Slack and model routes act AS
 *      you. (This replaced a shared tunnel key: one system per job.)
 *   4. THE PUBLIC DEMO IS FENCED IN (Oct 7). A sandboxed demo session reaches
 *      /api/auth/* and nothing else -- not the owner's ad data, not Slack, not
 *      the paid model. An allowlist, so a route added later is closed to it
 *      until someone decides otherwise.
 *
 * Exempt from 3 -- each is verified another way, or is how you sign in:
 *   /api/auth/*           signing in, and the "is there a server" probe
 *   /api/slack/events     Slack's signature over the raw body
 *   /api/slack/callback   the OAuth state minted by a signed-in request
 *   /api/connect/callback the OAuth state minted by a signed-in request
 */

const EXEMPT_SESSION = ['/api/auth/', '/api/slack/events', '/api/slack/callback', '/api/connect/callback'];
const EXEMPT_JSON = new Set(['/api/slack/events']);

export type Verdict = { ok: true } | { ok: false; status: number; error: string };

/** Pure decision, so it is tested without a server. */
export function check(req: IncomingMessage, path: string, signedIn: boolean, fenced = false): Verdict {
  const h = req.headers;
  const method = (req.method ?? 'GET').toUpperCase();

  /* 1. Cross-site. */
  const origin = h.origin;
  if (origin && origin !== 'null') {
    let host: string | undefined;
    try { host = new URL(origin).host; } catch { host = undefined; }
    if (host !== h.host && host !== h['x-forwarded-host']) {
      return { ok: false, status: 403, error: 'Cross-site request refused.' };
    }
  }
  const site = h['sec-fetch-site'];
  if ((site === 'cross-site' || site === 'same-site') && h['sec-fetch-mode'] !== 'navigate') {
    return { ok: false, status: 403, error: 'Cross-site request refused.' };
  }

  /* 2. JSON posts. */
  if (method !== 'GET' && method !== 'HEAD' && !EXEMPT_JSON.has(path)) {
    const type = String(h['content-type'] ?? '');
    const len = Number(h['content-length'] ?? 0);
    const chunked = Boolean(h['transfer-encoding']);
    if ((len > 0 || chunked) && !/^application\/json\b/i.test(type)) {
      return { ok: false, status: 415, error: 'JSON only.' };
    }
  }

  /* 4. The public demo. */
  if (fenced && !path.startsWith('/api/auth/')) {
    return { ok: false, status: 403, error: 'Not available in the demo account.' };
  }

  /* 3. Signed in. */
  if (signedIn || EXEMPT_SESSION.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p))) return { ok: true };
  return { ok: false, status: 401, error: 'Sign in to Growth first.' };
}

function page(res: ServerResponse, status: number, title: string, body: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)} · Growth</title>
<body style="font:15px/1.6 -apple-system,system-ui,sans-serif;padding:64px 32px;max-width:34rem;margin:auto;color:#16161C">
<h1 style="font-size:21px">${escapeHtml(title)}</h1><p style="color:#5A5A68">${body}</p>
<p><a href="/Growth/" style="color:#635BFF">Back to Growth</a></p>`);
}

/** A request for a file that holds secrets: *.local stores, .env files, keys. */
export function isSecretPath(raw: string): boolean {
  let path = raw.split(/[?#]/)[0];
  try { path = decodeURIComponent(path); } catch { return true; }   // malformed escapes: refuse
  const base = path.split('/').pop() ?? '';
  return /\.local(\.tmp)?$/i.test(base)
    || /^\.env(\..*)?$/i.test(base)
    || /\.(pem|key|crt|p12)$/i.test(base);
}

export function accessGuard(): Plugin {
  return {
    name: 'growth-access-guard',
    apply: 'serve',
    /* Registered FIRST in vite.config, so it runs before every other /api route. */
    configureServer(server: ViteDevServer) {
      /* 🚨 SECRETS ARE NOT STATIC FILES. Vite serves anything under the project
         root, and its default deny list covers .env but NOT *.local -- so
         .slack-tokens.local, the password hashes and the sessions came back 200
         to anyone, through the tunnel included (found Oct 1, before a single
         ad-platform token existed). `server.fs.deny` in vite.config is the first
         lock; this is the second, and it does not depend on Vite's path
         handling: any request naming a secret file is refused, whatever prefix,
         encoding or query string it arrives with. */
      server.middlewares.use((req, res, next) => {
        if (isSecretPath(req.url ?? '')) return send(res, 404, { error: 'Not found.' });
        next();
      });
      server.middlewares.use('/api', (req, res, next) => {
        const url = pathOf(req);
        if (!url) return send(res, 400, { error: 'Bad request.' });
        const path = `/api${url.pathname.replace(/\/$/, '')}`;
        const who = requester(req);
        const v = check(req, path, Boolean(who), Boolean(who) && sandboxed(who!, req));
        if (v.ok) return next();
        if (req.headers['sec-fetch-mode'] === 'navigate') return page(res, v.status, 'Not allowed', escapeHtml(v.error));
        return send(res, v.status, { error: v.error });
      });
    },
  };
}
