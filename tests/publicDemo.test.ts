import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession, createUser, demoUser, sessionUser, users } from '../server/authStore.js';
import { authApi, sandboxed } from '../server/auth.js';
import { check } from '../server/guard.js';

/**
 * 🔒 The public demo link (Oct 7): anyone can open Maya's account on the
 * hosted Growth, so a demo session must be fenced to /api/auth/* -- never the
 * owner's ad data, Slack, or the paid model -- and must never own anything.
 */
type Handler = (req: unknown, res: unknown, next?: () => void) => Promise<unknown>;
let dir = '';
let handler: Handler;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'growth-demo-'));
  process.env.GROWTH_DATA_DIR = dir;
  const uses: Handler[] = [];
  (authApi().configureServer as (s: unknown) => void)({ middlewares: { use: (p: string, h: Handler) => { if (p === '/api/auth') uses.push(h); } } });
  handler = uses[0];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.GROWTH_DATA_DIR;
  delete process.env.GROWTH_PUBLIC_DEMO;
});

const REMOTE = { host: 'growth-production-1846.up.railway.app', 'x-forwarded-for': '203.0.113.7', 'x-forwarded-proto': 'https' };
const LOCAL = { host: 'localhost:5173' };

async function openDemo(headers: Record<string, string>, cookie?: string) {
  const out = { status: 0, headers: {} as Record<string, string | string[]> };
  const req = { url: '/demo', method: 'GET', socket: { remoteAddress: '127.0.0.1' }, headers: { ...headers, ...(cookie ? { cookie } : {}) } };
  const res = {
    headersSent: false,
    set statusCode(v: number) { out.status = v; }, get statusCode() { return out.status; },
    setHeader: (k: string, v: string | string[]) => { out.headers[k.toLowerCase()] = v; },
    getHeader: (k: string) => out.headers[k.toLowerCase()],
    end() {},
  };
  await handler(req, res);
  const set = ([] as string[]).concat(out.headers['set-cookie'] ?? []).find((c) => c.startsWith('growth_session='));
  return { ...out, token: set?.split(';')[0].split('=')[1] };
}

describe('the shareable /demo link', () => {
  it('is off unless GROWTH_PUBLIC_DEMO=1: a stranger gets bounced, no session', async () => {
    const r = await openDemo(REMOTE);
    expect(r.status).toBe(302);
    expect(r.token).toBeUndefined();
  });

  it('when on: signs a visitor in as Maya, for a day, and sends them to the app', async () => {
    process.env.GROWTH_PUBLIC_DEMO = '1';
    createUser({ email: 'tommy@example.com', name: 'Tommy' });
    const r = await openDemo(REMOTE);
    expect(r.status).toBe(302);
    expect(r.headers.location).toBe('/Growth/');
    expect(r.token).toBeTruthy();
    expect(sessionUser(r.token)).toMatchObject({ name: 'Maya Okonkwo', demo: true, role: 'member' });
    expect(String(r.headers['set-cookie'])).toMatch(/Max-Age=86400/);
  });

  it('🛑 never swaps a signed-in real person out of their own account', async () => {
    process.env.GROWTH_PUBLIC_DEMO = '1';
    const tommy = createUser({ email: 'tommy@example.com', name: 'Tommy' });
    const r = await openDemo(REMOTE, `growth_session=${createSession(tommy.id).token}`);
    expect(r.status).toBe(302);
    expect(r.token).toBeUndefined();
  });

  it('🛑 opening the demo first does not take the owner seat from the real first person', async () => {
    process.env.GROWTH_PUBLIC_DEMO = '1';
    await openDemo(REMOTE);
    const tommy = createUser({ email: 'tommy@example.com', name: 'Tommy' });
    expect(tommy).toMatchObject({ role: 'owner', seat: 'maya' });
    expect(users().find((u) => u.demo)).toMatchObject({ role: 'member' });
    expect(new Set(users().map((u) => u.id)).size).toBe(users().length);
  });

  it('🛑 an old demo made as owner on a fresh install is demoted when opened publicly', () => {
    demoUser({ mayOwn: true });
    expect(demoUser()).toMatchObject({ role: 'member' });
  });
});

describe('the fence', () => {
  const req = (h: Record<string, string>) => ({ method: 'GET', headers: h }) as never;

  it('a demo session is sandboxed from outside, or anywhere once the public demo is on', () => {
    expect(sandboxed({ demo: true }, req(REMOTE))).toBe(true);
    expect(sandboxed({ demo: true }, req(LOCAL))).toBe(false);          // Tommy's own local demo keeps its Slack
    process.env.GROWTH_PUBLIC_DEMO = '1';
    expect(sandboxed({ demo: true }, req(LOCAL))).toBe(true);
    expect(sandboxed({ demo: false }, req(REMOTE))).toBe(false);
  });

  it('🛑 reaches /api/auth/* and nothing else: no ad data, no Slack, no paid model', () => {
    const r = req(LOCAL);
    for (const p of ['/api/meta/data', '/api/google/data', '/api/meta/accounts', '/api/slack/messages', '/api/assistant', '/api/connect/meta', '/api/anything-added-later']) {
      expect(check(r, p, true, true)).toMatchObject({ ok: false, status: 403 });
    }
    expect(check(r, '/api/auth/me', true, true)).toEqual({ ok: true });
    expect(check(r, '/api/auth/logout', true, true)).toEqual({ ok: true });
    /* A real member is not fenced. */
    expect(check(r, '/api/meta/data', true, false)).toEqual({ ok: true });
  });
});
