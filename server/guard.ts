import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import { escapeHtml, pathOf, send } from './http.js';

/**
 * 🛑 THE GATE IN FRONT OF EVERY /api ROUTE.
 *
 * The API holds a real Slack user token and a paid Anthropic key, and the dev
 * server is sometimes public through a Cloudflare tunnel -- whose URL is not a
 * secret: "Open in Growth" links post it into Slack. Until this existed, anyone
 * with that URL could read the connected person's DMs and post as them.
 *
 * Three rules, in order:
 *
 *   1. NO CROSS-SITE REQUESTS. A page on any other site can fire a "simple"
 *      POST at localhost:5173 -- CORS stops it reading the answer, not sending
 *      the request. A foreign Origin, or a cross-site fetch, is refused. Top-level
 *      navigations are allowed (that is how OAuth providers send people back).
 *   2. POSTS ARE JSON. A form or text/plain POST is exactly the no-preflight
 *      shape a hostile page uses; the app itself only ever sends JSON.
 *   3. REMOTE NEEDS THE KEY. Requests from this machine are trusted, as before.
 *      Through the tunnel, a request needs the cookie set by visiting
 *      /api/access?key=<GROWTH_ACCESS_KEY> once. No key configured = remote API
 *      access is off, and says so.
 *
 * Exempt from 3 -- each is verified another way:
 *   /api/slack/events     Slack's signature over the raw body
 *   /api/slack/callback   the OAuth state minted on this machine
 *   /api/connect/callback the OAuth state minted on this machine
 */

const COOKIE = 'growth_access';
const EXEMPT_REMOTE = new Set(['/api/slack/events', '/api/slack/callback', '/api/connect/callback']);
const EXEMPT_JSON = new Set(['/api/slack/events']);

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

/** Came from this machine, not through a tunnel or proxy. */
export function isLocal(req: IncomingMessage): boolean {
  const h = req.headers;
  if (h['cf-connecting-ip'] || h['x-forwarded-for'] || h['x-forwarded-host']) return false;
  return LOOPBACK.test(String(h.host ?? ''));
}

const digest = (key: string) => createHash('sha256').update(`growth-access:${key}`).digest('hex');

function same(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cookieOf(req: IncomingMessage, name: string): string | undefined {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export type Verdict = { ok: true } | { ok: false; status: number; error: string };

/** Pure decision, so it is tested without a server. */
export function check(req: IncomingMessage, path: string, accessKey: string | undefined): Verdict {
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

  /* 3. Remote. */
  if (isLocal(req) || EXEMPT_REMOTE.has(path) || path === '/api/access') return { ok: true };
  if (!accessKey) {
    return { ok: false, status: 403, error: 'Remote access to this API is off. Set GROWTH_ACCESS_KEY in .env.local to allow it.' };
  }
  const c = cookieOf(req, COOKIE);
  if (!c || !same(c, digest(accessKey))) {
    return { ok: false, status: 401, error: 'This API needs the access key. Open /api/access?key=… once in this browser.' };
  }
  return { ok: true };
}

function page(res: ServerResponse, status: number, title: string, body: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)} · Growth</title>
<body style="font:15px/1.6 -apple-system,system-ui,sans-serif;padding:64px 32px;max-width:34rem;margin:auto;color:#16161C">
<h1 style="font-size:21px">${escapeHtml(title)}</h1><p style="color:#5A5A68">${body}</p>
<p><a href="/Growth/" style="color:#635BFF">Back to Growth</a></p>`);
}

export function accessGuard(): Plugin {
  return {
    name: 'growth-access-guard',
    apply: 'serve',
    /* Registered FIRST in vite.config, so it runs before every other /api route. */
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', (req, res, next) => {
        const url = pathOf(req);
        if (!url) return send(res, 400, { error: 'Bad request.' });
        const path = `/api${url.pathname.replace(/\/$/, '')}`;
        const key = process.env.GROWTH_ACCESS_KEY || undefined;

        if (path === '/api/access' && req.method === 'GET') {
          const given = url.searchParams.get('key') ?? '';
          if (!key || !same(digest(given), digest(key))) {
            return page(res, 403, 'That key did not work', 'Check GROWTH_ACCESS_KEY in .env.local.');
          }
          const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
          res.setHeader('Set-Cookie', `${COOKIE}=${digest(key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
          res.statusCode = 302;
          res.setHeader('Location', '/Growth/');
          return res.end();
        }

        const v = check(req, path, key);
        if (v.ok) return next();
        if (req.headers['sec-fetch-mode'] === 'navigate') return page(res, v.status, 'Not allowed', escapeHtml(v.error));
        return send(res, v.status, { error: v.error });
      });
    },
  };
}
