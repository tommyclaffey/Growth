import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPassword, hashPassword, verifyPassword } from '../server/authStore.js';
import { authApi } from '../server/auth.js';

/**
 * 🔒 Login CSRF: someone starts a Google sign-in with THEIR account, stops at
 * the callback, and sends you the link -- you would land signed in as them.
 * The state now has to come back to the browser that started it.
 */
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let dir = '';
let handler: Handler;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'growth-state-'));
  process.env.GROWTH_DATA_DIR = dir;
  process.env.GOOGLE_CLIENT_ID = 'cid';
  process.env.GOOGLE_CLIENT_SECRET = 'secret';
  const uses: Handler[] = [];
  (authApi().configureServer as (s: unknown) => void)({ middlewares: { use: (p: string, h: Handler) => { if (p === '/api/auth') uses.push(h); } } });
  handler = uses[0];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const k of ['GROWTH_DATA_DIR', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) delete process.env[k];
});

async function get(url: string, cookie?: string) {
  const out = { status: 200, headers: {} as Record<string, unknown>, body: '' };
  const res = {
    headersSent: false,
    set statusCode(v: number) { out.status = v; }, get statusCode() { return out.status; },
    getHeader: (k: string) => out.headers[k.toLowerCase()],
    setHeader: (k: string, v: unknown) => { out.headers[k.toLowerCase()] = v; },
    end: (b?: string) => { out.body = b ?? ''; },
  };
  await handler({ url, method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { host: 'localhost:5173', ...(cookie ? { cookie } : {}) } }, res);
  return out;
}
const stateCookie = (h: Record<string, unknown>) => {
  const c = String(h['set-cookie'] ?? '');
  return c.match(/growth_oauth_state=([0-9a-f]+)/)?.[1];
};

describe('the sign-in round trip belongs to the browser that started it', () => {
  it('start sets an HttpOnly state cookie scoped to /api/auth', async () => {
    const r = await get('/start/google');
    expect(r.status).toBe(302);
    expect(String(r.headers['set-cookie'])).toMatch(/growth_oauth_state=[0-9a-f]{32}; Path=\/api\/auth; HttpOnly; SameSite=Lax; Max-Age=600/);
    expect(new URL(String(r.headers.location)).searchParams.get('state')).toBe(stateCookie(r.headers));
  });

  it('🛑 a callback opened in another browser (no cookie, or someone else’s) is refused', async () => {
    const r = await get('/start/google');
    const state = new URL(String(r.headers.location)).searchParams.get('state')!;
    expect((await get(`/callback?state=${state}&error=access_denied`)).body).toMatch(/Finish where you started/);
    const r2 = await get('/start/google');
    const state2 = new URL(String(r2.headers.location)).searchParams.get('state')!;
    expect((await get(`/callback?state=${state2}&error=x`, `growth_oauth_state=${stateCookie(r.headers)}`)).body).toMatch(/Finish where you started/);
  });

  it('the same browser gets through the check', async () => {
    const r = await get('/start/google');
    const state = new URL(String(r.headers.location)).searchParams.get('state')!;
    const back = await get(`/callback?state=${state}&error=access_denied`, `growth_oauth_state=${state}`);
    expect(back.body).toMatch(/did not sign you in/);
    expect(back.body).not.toMatch(/Finish where you started/);
  });
});

describe('verifyPassword', () => {
  it('agrees with the synchronous check, and is async', async () => {
    const h = hashPassword('correct horse battery');
    const p = verifyPassword('correct horse battery', h);
    expect(p).toBeInstanceOf(Promise);
    expect(await p).toBe(checkPassword('correct horse battery', h));
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('anything', undefined)).toBe(false);
  });
});
