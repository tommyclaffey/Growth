import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../server/authStore.js';
import { authApi } from '../server/auth.js';

/**
 * 🔒 Behind the tunnel every request arrives from loopback. Keyed on the
 * socket address, a stranger could lock the owner out on his own Mac and spray
 * guesses across many emails without limit (security review, Oct 1).
 */
type Handler = (req: unknown, res: unknown, next?: () => void) => Promise<unknown>;
let dir = '';
let handler: Handler;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'growth-limit-'));
  process.env.GROWTH_DATA_DIR = dir;
  const uses: Handler[] = [];
  (authApi().configureServer as (s: unknown) => void)({ middlewares: { use: (p: string, h: Handler) => { if (p === '/api/auth') uses.push(h); } } });
  handler = uses[0];
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.GROWTH_DATA_DIR; });

async function login(email: string, password: string, remoteIp?: string) {
  const body = JSON.stringify({ email, password });
  const req = Object.assign(Readable.from([Buffer.from(body)]), {
    url: '/login', method: 'POST', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:5173', 'content-type': 'application/json', 'content-length': String(body.length),
      ...(remoteIp ? { 'cf-connecting-ip': remoteIp, host: 'x.trycloudflare.com' } : {}) },
  });
  let status = 0;
  const res = { headersSent: false, set statusCode(v: number) { status = v; }, get statusCode() { return status; }, setHeader() {}, end() {} };
  await handler(req, res);
  return status;
}

describe('login attempts', () => {
  it('a stranger on the tunnel cannot lock the owner out locally', async () => {
    createUser({ email: 'tommy@example.com', name: 'Tommy', password: 'correct horse battery' });
    for (let i = 0; i < 12; i++) await login('tommy@example.com', 'wrong', '203.0.113.9');
    expect(await login('tommy@example.com', 'wrong', '203.0.113.9')).toBe(429);
    expect(await login('tommy@example.com', 'correct horse battery')).toBe(200);
  });

  it('remote guesses across MANY emails share one cap', async () => {
    for (let i = 0; i < 10; i++) await login(`guess${i}@example.com`, 'wrong', `198.51.100.${i}`);
    expect(await login('another@example.com', 'wrong', '198.51.100.77')).toBe(429);
  });
});
