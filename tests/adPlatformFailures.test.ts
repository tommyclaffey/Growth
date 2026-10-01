import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession, createUser } from '../server/authStore.js';
import { metaApi } from '../server/metaApi.js';
import { googleApi } from '../server/googleAdsApi.js';

/**
 * What happens on Monday when a platform says no. Every path here used to be
 * untested: Meta revoking a token (error 190), Google refusing a refresh token
 * (a Testing-mode consent screen ends sign-ins every 7 days), and Google with
 * no developer token (retired Sept 9, 2026). Fake platforms, real handlers.
 */
type Handler = (req: unknown, res: unknown) => Promise<unknown>;
let dir = '';
const ENV = ['GROWTH_DATA_DIR', 'META_CLIENT_ID', 'META_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN'];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'growth-platform-'));
  process.env.GROWTH_DATA_DIR = dir;
  process.env.META_CLIENT_ID = 'app'; process.env.META_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'csecret';
  delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
});
afterEach(() => { vi.unstubAllGlobals(); rmSync(dir, { recursive: true, force: true }); for (const k of ENV) delete process.env[k]; });

function mount(plugin: { configureServer?: unknown }, mountPath: string): Handler {
  let h: Handler | undefined;
  (plugin.configureServer as (s: unknown) => void)({
    middlewares: { use: (p: string, fn: Handler) => { if (p === mountPath) h = fn; } },
    /* The real data-layer modules, as Vite would load them. */
    ssrLoadModule: (p: string) => import(/* @vite-ignore */ `..${p}`),
  });
  return h!;
}
async function call(h: Handler, method: string, url: string, opts: { cookie?: string; body?: unknown } = {}) {
  const raw = opts.body === undefined ? '' : JSON.stringify(opts.body);
  const req = Object.assign(Readable.from(raw ? [Buffer.from(raw)] : []), {
    url, method, socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:5173', 'content-type': 'application/json', ...(opts.cookie ? { cookie: opts.cookie } : {}) },
  });
  const out = { status: 200, body: {} as Record<string, unknown> };
  const res = {
    headersSent: false,
    set statusCode(v: number) { out.status = v; }, get statusCode() { return out.status; },
    setHeader() {}, getHeader() { return undefined; },
    end: (b?: string) => { out.body = b ? JSON.parse(b) : {}; },
  };
  await h(req, res);
  return out;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Meta', () => {
  it('⭐ error 190 (token no longer valid) says "connect again" and Settings shows expired', async () => {
    writeFileSync(join(dir, '.meta-tokens.local'), JSON.stringify({ accessToken: 'tok', accountId: 'act_1' }));
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: { message: 'Error validating access token', code: 190 } }, 400)));
    const h = mount(metaApi(), '/api/meta');
    const r = await call(h, 'GET', '/accounts');
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('Your Meta sign-in is no longer valid. Connect Meta again in Settings.');
    expect((await call(h, 'GET', '/status')).body).toMatchObject({ connected: true, expired: true });
  });

  it('a token ending within the week reports its days left', async () => {
    writeFileSync(join(dir, '.meta-tokens.local'), JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3.5 * 86_400_000 }));
    const s = await call(mount(metaApi(), '/api/meta'), 'GET', '/status');
    expect(s.body).toMatchObject({ expired: false, expiresInDays: 3 });
  });

  it('🔒 only the owner can switch the ad account', async () => {
    writeFileSync(join(dir, '.meta-tokens.local'), JSON.stringify({ accessToken: 'tok' }));
    createUser({ email: 'tommy@example.com', name: 'Tommy' });
    const member = createUser({ email: 'jess@example.com', name: 'Jess' });
    const r = await call(mount(metaApi(), '/api/meta'), 'POST', '/account', { cookie: `growth_session=${createSession(member.id).token}`, body: { id: 'act_2' } });
    expect(r.status).toBe(403);
    expect(JSON.parse(readFileSync(join(dir, '.meta-tokens.local'), 'utf8')).accountId).toBeUndefined();
  });

  it('asks Meta for the current Marketing API version, never v21', async () => {
    writeFileSync(join(dir, '.meta-tokens.local'), JSON.stringify({ accessToken: 'tok' }));
    const f = vi.fn(async () => json({ data: [] }));
    vi.stubGlobal('fetch', f);
    await call(mount(metaApi(), '/api/meta'), 'GET', '/accounts');
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v25\.0\/me\/adaccounts/);
  });
});

describe('Google Ads', () => {
  it('⭐ a refused refresh token (e.g. 7-day Testing mode) says "connect again" and Settings shows expired', async () => {
    writeFileSync(join(dir, '.google-ads-tokens.local'), JSON.stringify({ refreshToken: 'r' }));
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'invalid_grant' }, 400)));
    const h = mount(googleApi(), '/api/google');
    const r = await call(h, 'GET', '/accounts');
    expect(r.status).toBe(502);
    expect(String(r.body.error)).toMatch(/revoked or has expired\. Connect Google Ads again/);
    expect((await call(h, 'GET', '/status')).body).toMatchObject({ connected: true, expired: true });
  });

  it('works with NO developer token, and sends none', async () => {
    writeFileSync(join(dir, '.google-ads-tokens.local'), JSON.stringify({ refreshToken: 'r' }));
    const f = vi.fn(async (url: string) => (String(url).includes('oauth2')
      ? json({ access_token: 'a', expires_in: 3600 })
      : json({ resourceNames: [] })));
    vi.stubGlobal('fetch', f);
    const r = await call(mount(googleApi(), '/api/google'), 'GET', '/accounts');
    expect(r.status).toBe(200);
    const ads = (f.mock.calls as unknown as [string, { headers: Record<string, string> }][]).find((c) => String(c[0]).includes('googleads'))!;
    expect(ads[1].headers['developer-token']).toBeUndefined();
  });

  it('reconnecting clears the expired flag', async () => {
    writeFileSync(join(dir, '.google-ads-tokens.local'), JSON.stringify({ refreshToken: 'old', expired: true }));
    vi.stubGlobal('fetch', vi.fn(async () => json({ access_token: 'a', refresh_token: 'new', expires_in: 3600 })));
    const { exchangeGoogleCode } = await import('../server/googleAdsApi.js');
    await exchangeGoogleCode('code', 'http://localhost:5173/api/connect/callback');
    expect((await call(mount(googleApi(), '/api/google'), 'GET', '/status')).body).toMatchObject({ connected: true, expired: false });
  });
});
