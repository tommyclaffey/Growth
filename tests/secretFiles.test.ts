import { writeFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { isSecretPath } from '../server/guard.js';

/**
 * 🚨 Found Oct 1: the dev server returned 200 for .slack-tokens.local, the
 * password hashes and the sessions -- to anyone, tunnel included. Vite's
 * default deny list covers .env, not *.local. Two locks now (server.fs.deny
 * and isSecretPath in the access guard); this boots the REAL config and asks.
 */
describe('isSecretPath', () => {
  it('names every secret store, however it is spelled', () => {
    for (const p of ['/Growth/.slack-tokens.local', '/.meta-tokens.local?raw', '/Growth/%2Egrowth-users%2Elocal',
      '/@fs/Users/x/Growth/.google-ads-tokens.local', '/.env', '/.env.local', '/x/server.key', '/A.LOCAL', '/x/.y.local.tmp']) {
      expect(isSecretPath(p), p).toBe(true);
    }
  });
  it('leaves the app alone', () => {
    for (const p of ['/Growth/', '/Growth/src/main.tsx', '/Growth/src/data/metrics.ts?import', '/api/auth/me', '/Growth/locale.json']) {
      expect(isSecretPath(p), p).toBe(false);
    }
  });
});

describe('the real dev server refuses secret files', () => {
  let server: ViteDevServer;
  let base = '';
  const probe = '.zz-probe-secret.local';
  beforeAll(async () => {
    writeFileSync(probe, 'SECRET-PROBE');
    server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { port: 0, strictPort: false } });
    await server.listen();
    /* resolvedUrls, not 127.0.0.1: Vite may bind IPv6 localhost only. */
    base = server.resolvedUrls!.local[0];
  }, 30_000);
  afterAll(async () => {
    await server?.close();
    rmSync(probe, { force: true });
  });

  it('every spelling of a *.local file is refused, and the app still loads', async () => {
    for (const p of [probe, `${probe}?raw`, `${probe}?import`, `@fs${process.cwd()}/${probe}`, encodeURIComponent(probe)]) {
      const r = await fetch(base + p);
      const body = await r.text();
      expect(body, p).not.toContain('SECRET-PROBE');
      expect(r.status, p).toBeGreaterThanOrEqual(400);
    }
    expect((await fetch(base)).status).toBe(200);
  }, 30_000);
});
