import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession, createUser } from '../server/authStore.js';
import { channelOauth } from '../server/channelOauth.js';

/**
 * 🔒 One ad-account connection serves everyone signed in, so connecting or
 * replacing it is the owner's call (security review, Oct 1). And the return
 * trip must land in the session that started it.
 */
type Handler = (req: unknown, res: unknown, next?: () => void) => unknown;
let dir = '';
let handler: Handler;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'growth-owner-'));
  process.env.GROWTH_DATA_DIR = dir;
  process.env.META_CLIENT_ID = 'test-app';
  const uses: Handler[] = [];
  const server = { middlewares: { use: (_p: string, h: Handler) => uses.push(h) } };
  (channelOauth().configureServer as (s: unknown) => void)(server);
  handler = uses[0];
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.GROWTH_DATA_DIR; delete process.env.META_CLIENT_ID; });

async function hit(url: string, token?: string) {
  const out = { status: 200, headers: {} as Record<string, string>, body: '' };
  const res = {
    set statusCode(v: number) { out.status = v; }, get statusCode() { return out.status; },
    setHeader: (k: string, v: string) => { out.headers[k.toLowerCase()] = v; },
    end: (b?: string) => { out.body = b ?? ''; },
  };
  const req = { url, method: 'GET', headers: { host: 'localhost:5173', ...(token ? { cookie: `growth_session=${token}` } : {}) } };
  await handler(req, res);
  return out;
}

describe('connecting an ad account', () => {
  it('a member cannot start it; the owner can', async () => {
    const owner = createUser({ email: 'tommy@example.com', name: 'Tommy' });
    const member = createUser({ email: 'jess@example.com', name: 'Jess' });
    const m = await hit('/meta', createSession(member.id).token);
    expect(m.body).toMatch(/Only the owner connects ad accounts/);
    expect(m.status).toBe(200);
    const o = await hit('/meta', createSession(owner.id).token);
    expect(o.status).toBe(302);
    expect(o.headers.location).toMatch(/^https:\/\/www\.facebook\.com\/v\d+\.0\/dialog\/oauth\?/);
    expect(o.headers.location).toContain('scope=ads_read');
    expect(await hit('/meta')).toMatchObject({ body: expect.stringMatching(/Only the owner/) });
  });

  it('the callback must land in the session that started it', async () => {
    const owner = createUser({ email: 'tommy@example.com', name: 'Tommy' });
    const member = createUser({ email: 'jess@example.com', name: 'Jess' });
    const start = await hit('/meta', createSession(owner.id).token);
    const state = new URL(start.headers.location).searchParams.get('state')!;
    const back = await hit(`/callback?state=${encodeURIComponent(state)}&error=access_denied`, createSession(member.id).token);
    expect(back.body).toMatch(/Finish where you started/);
  });
});
