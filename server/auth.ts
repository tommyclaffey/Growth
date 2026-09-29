import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import {
  MIN_PASSWORD, checkPassword, createSession, createUser, endSession, failed, mayJoin, normEmail,
  sessionUser, succeeded, tooMany, updateUser, userByEmail, userByIdentity, userById,
  type Provider, type User,
} from './authStore.js';
import { cookieOf, deadline, escapeHtml, isLocal, originOf, pathOf, readJson, send } from './http.js';
import { listWorkspaces, setLink } from './slackStore.js';

/**
 * Signing in -- five ways, one account.
 *
 *   Email + password     no provider needed
 *   Google               OpenID Connect
 *   Slack                "Sign in with Slack" (OpenID Connect) -- also links
 *                        the person's Slack account, in the same consent
 *   Microsoft            any Microsoft account, personal or work
 *   Microsoft Teams      work/school accounts only -- the accounts Teams uses
 *
 * Teams and Microsoft are the SAME identity provider (Microsoft Entra). They
 * differ in which accounts they accept: "organizations" vs "common".
 *
 * Every provider is the standard authorization-code flow: the id_token is
 * taken straight from the provider's token endpoint over TLS, with our client
 * secret, so its claims are trusted per OpenID Connect Core 3.1.3.7 -- and
 * `aud`, `iss` and our `nonce` are still checked.
 *
 * ⚠️ MERGING BY EMAIL. A new provider sign-in joins an EXISTING account with
 * the same email only when the provider vouches the email is verified (Google,
 * Slack). Microsoft does not guarantee that -- a tenant admin can set any
 * address -- so a Microsoft sign-in never takes over an account by email. To
 * add Microsoft to an existing account, sign in first, then connect it.
 */

interface ProviderConfig {
  label: string;
  authorize: string;
  token: string;
  scope: string;
  idEnv: string;
  secretEnv: string;
  issuer: (iss: string) => boolean;
  extra?: Record<string, string>;
}

const MS = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
const msIssuer = (iss: string) => /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]{36}\/v2\.0$/.test(iss);

export const PROVIDERS: Record<Provider, ProviderConfig> = {
  google: {
    label: 'Google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    idEnv: 'GOOGLE_CLIENT_ID', secretEnv: 'GOOGLE_CLIENT_SECRET',
    issuer: (i) => i === 'https://accounts.google.com' || i === 'accounts.google.com',
    extra: { prompt: 'select_account' },
  },
  slack: {
    label: 'Slack',
    authorize: 'https://slack.com/openid/connect/authorize',
    token: 'https://slack.com/api/openid.connect.token',
    scope: 'openid email profile',
    idEnv: 'SLACK_CLIENT_ID', secretEnv: 'SLACK_CLIENT_SECRET',
    issuer: (i) => i === 'https://slack.com',
  },
  microsoft: {
    label: 'Microsoft',
    authorize: `${MS('common')}/authorize`,
    token: `${MS('common')}/token`,
    scope: 'openid email profile',
    idEnv: 'MS_CLIENT_ID', secretEnv: 'MS_CLIENT_SECRET',
    issuer: msIssuer,
    extra: { prompt: 'select_account', response_mode: 'query' },
  },
  teams: {
    label: 'Microsoft Teams',
    authorize: `${MS('organizations')}/authorize`,
    token: `${MS('organizations')}/token`,
    scope: 'openid email profile',
    idEnv: 'MS_CLIENT_ID', secretEnv: 'MS_CLIENT_SECRET',
    issuer: msIssuer,
    extra: { prompt: 'select_account', response_mode: 'query' },
  },
};

export const configured = (p: Provider) =>
  Boolean(process.env[PROVIDERS[p].idEnv] && process.env[PROVIDERS[p].secretEnv]);

const COOKIE = 'growth_session';

/** The signed-in person for this request, or undefined. Used by the gate and by Slack. */
export function requester(req: IncomingMessage): User | undefined {
  return sessionUser(cookieOf(req, COOKIE));
}

function setSession(req: IncomingMessage, res: ServerResponse, user: User) {
  const { token, maxAge } = createSession(user.id);
  const secure = originOf(req).startsWith('https:') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
}

const publicUser = (u: User) => ({ id: u.id, seat: u.seat, name: u.name, email: u.email, avatar: u.avatar, role: u.role });

/* ------------------------------------------------------------------ OAuth */

/* state → what started it. The nonce binds the id_token to this request; `link`
   is set when a signed-in person is ADDING a provider to their account. */
const pending = new Map<string, { provider: Provider; nonce: string; exp: number; link?: string }>();

export interface Claims {
  iss: string; aud: string | string[]; sub: string; nonce?: string;
  email?: string; email_verified?: boolean | string; name?: string; picture?: string;
  preferred_username?: string; oid?: string; tid?: string;
  'https://slack.com/team_id'?: string;
}

/** The id_token's payload. Not signature-checked -- see the file header for why that is correct here. */
export function decodeIdToken(jwt: string): Claims {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('The provider returned no usable id_token.');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Claims;
}

/** Stable subject per provider, and whether the provider vouches for the email. */
export function identityOf(p: Provider, c: Claims): { subject: string; email?: string; verified: boolean; name?: string; picture?: string } {
  if (p === 'microsoft' || p === 'teams') {
    /* oid is per-person within a tenant; the pair is globally unique. */
    return { subject: `${c.tid}:${c.oid ?? c.sub}`, email: c.email ?? c.preferred_username, verified: false, name: c.name };
  }
  const verified = c.email_verified === true || c.email_verified === 'true';
  return { subject: c.sub, email: c.email, verified, name: c.name, picture: c.picture };
}

function page(res: ServerResponse, status: number, title: string, body: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)} · Growth</title>
<body style="font:15px/1.6 -apple-system,system-ui,sans-serif;padding:64px 32px;max-width:34rem;margin:auto;color:#16161C">
<h1 style="font-size:21px">${escapeHtml(title)}</h1><p style="color:#5A5A68">${escapeHtml(body)}</p>
<p><a href="/Growth/" style="color:#635BFF">Back to Growth</a></p>`);
}

async function exchange(p: Provider, code: string, redirectUri: string): Promise<Claims> {
  const cfg = PROVIDERS[p];
  const r = await fetch(cfg.token, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: redirectUri,
      client_id: process.env[cfg.idEnv]!, client_secret: process.env[cfg.secretEnv]!,
    }),
    signal: deadline(),
  });
  const body = await r.json().catch(() => ({})) as { id_token?: string; error?: string; error_description?: string };
  if (!r.ok || !body.id_token) throw new Error(body.error_description ?? body.error ?? `${cfg.label} returned ${r.status}`);
  return decodeIdToken(body.id_token);
}

/* ----------------------------------------------------------------- plugin */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function authApi(): Plugin {
  return {
    name: 'growth-auth',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/auth', async (req, res) => {
        try {
          const url = pathOf(req);
          if (!url) return send(res, 400, { error: 'Bad request.' });
          const path = url.pathname.replace(/\/$/, '');
          const me = requester(req);

          /* Also the app's "is there a server?" probe -- always 200. */
          if (req.method === 'GET' && path === '/me') {
            const { users } = await import('./authStore.js');
            const firstRun = users().length === 0;
            return send(res, 200, {
              user: me ? publicUser(me) : null,
              providers: Object.fromEntries((Object.keys(PROVIDERS) as Provider[]).map((p) => [p, configured(p)])),
              firstRun,
              /* The first account can only be made from this machine. */
              canCreateOwner: firstRun && isLocal(req),
            });
          }

          if (req.method === 'POST' && path === '/signup') {
            const b = await readJson(req, 10_000);
            const email = typeof b.email === 'string' ? normEmail(b.email) : '';
            const password = typeof b.password === 'string' ? b.password : '';
            const name = typeof b.name === 'string' ? b.name.slice(0, 80) : '';
            if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'Enter a valid email address.' });
            if (password.length < MIN_PASSWORD) return send(res, 400, { error: `Use at least ${MIN_PASSWORD} characters for your password.` });
            if (userByEmail(email)) return send(res, 409, { error: 'There is already an account with that email. Sign in instead.' });
            if (!mayJoin(email, isLocal(req))) {
              return send(res, 403, { error: 'This email has not been invited. Ask the owner to add it to GROWTH_ALLOWED_EMAILS.' });
            }
            const user = createUser({ email, name, password });
            setSession(req, res, user);
            return send(res, 200, { user: publicUser(user) });
          }

          if (req.method === 'POST' && path === '/login') {
            const b = await readJson(req, 10_000);
            const email = typeof b.email === 'string' ? normEmail(b.email) : '';
            const password = typeof b.password === 'string' ? b.password : '';
            const key = `${req.socket.remoteAddress}|${email}`;
            if (tooMany(key)) return send(res, 429, { error: 'Too many attempts. Wait 15 minutes and try again.' });
            const user = userByEmail(email);
            /* One message for both failures -- which one it was is exactly what
               someone guessing accounts wants to learn. */
            if (!checkPassword(password, user?.password) || !user) {
              failed(key);
              return send(res, 401, { error: 'That email and password do not match.' });
            }
            succeeded(key);
            setSession(req, res, user);
            return send(res, 200, { user: publicUser(user) });
          }

          if (req.method === 'POST' && path === '/logout') {
            endSession(cookieOf(req, COOKIE));
            res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
            return send(res, 200, { ok: true });
          }

          /* ---- provider sign-in ---- */
          const start = path.match(/^\/start\/(google|slack|microsoft|teams)$/);
          if (req.method === 'GET' && start) {
            const p = start[1] as Provider;
            if (!configured(p)) {
              return page(res, 200, `${PROVIDERS[p].label} sign-in is not set up`,
                `Add ${PROVIDERS[p].idEnv} and ${PROVIDERS[p].secretEnv} to .env.local and restart, and register ${originOf(req)}/api/auth/callback as a redirect URI.`);
            }
            const state = randomBytes(16).toString('hex');
            const nonce = randomBytes(16).toString('hex');
            pending.set(state, { provider: p, nonce, exp: Date.now() + 10 * 60_000, link: me?.id });
            for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
            const cfg = PROVIDERS[p];
            const auth = new URL(cfg.authorize);
            auth.searchParams.set('response_type', 'code');
            auth.searchParams.set('client_id', process.env[cfg.idEnv]!);
            auth.searchParams.set('redirect_uri', `${originOf(req)}/api/auth/callback`);
            auth.searchParams.set('scope', cfg.scope);
            auth.searchParams.set('state', state);
            auth.searchParams.set('nonce', nonce);
            for (const [k, v] of Object.entries(cfg.extra ?? {})) auth.searchParams.set(k, v);
            res.statusCode = 302;
            res.setHeader('Location', auth.toString());
            return res.end();
          }

          if (req.method === 'GET' && path === '/callback') {
            const state = url.searchParams.get('state') ?? '';
            const p = pending.get(state);
            pending.delete(state);
            if (!p || p.exp < Date.now()) return page(res, 400, 'That sign-in link expired', 'Start again from Growth.');
            const cfg = PROVIDERS[p.provider];
            if (url.searchParams.get('error')) {
              return page(res, 400, `${cfg.label} did not sign you in`, url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? '');
            }
            const claims = await exchange(p.provider, url.searchParams.get('code') ?? '', `${originOf(req)}/api/auth/callback`);
            const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
            if (!cfg.issuer(claims.iss) || !aud.includes(process.env[cfg.idEnv]!) || claims.nonce !== p.nonce) {
              return page(res, 400, 'That sign-in could not be verified', 'Start again from Growth.');
            }
            const id = identityOf(p.provider, claims);

            let user = userByIdentity(p.provider, id.subject);
            if (!user && p.link) {
              /* Signed in already and adding this provider: attach it. */
              user = updateUser(p.link, (u) => ({ ...u, identities: { ...u.identities, [p.provider]: id.subject } }));
            }
            if (!user && id.email && id.verified) {
              const same = userByEmail(id.email);
              if (same) user = updateUser(same.id, (u) => ({ ...u, identities: { ...u.identities, [p.provider]: id.subject } }));
            }
            if (!user) {
              if (!id.email || !mayJoin(id.email, isLocal(req))) {
                return page(res, 403, 'You have not been invited to this Growth',
                  `${id.email ?? 'This account'} is not on the list. Ask the owner to add it to GROWTH_ALLOWED_EMAILS.`);
              }
              user = createUser({ email: id.email, name: id.name ?? '', avatar: id.picture, identity: [p.provider, id.subject] });
            }

            /* Sign in with Slack is also the consent that links the Slack
               account -- made by the person, for their own seat. */
            if (p.provider === 'slack') {
              const team = claims['https://slack.com/team_id'];
              if (team && listWorkspaces().some((w) => w.teamId === team)) setLink(team, user.seat, id.subject);
            }

            setSession(req, res, userById(user.id)!);
            res.statusCode = 302;
            res.setHeader('Location', '/Growth/');
            return res.end();
          }

          return send(res, 404, { error: 'Unknown auth endpoint.' });
        } catch (e) {
          return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
        }
      });
    },
  };
}
