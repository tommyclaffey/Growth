import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { check } from '../server/guard.js';
import { BodyTooLarge, escapeHtml, isLocal, readJson, readRaw } from '../server/http.js';

const req = (headers: Record<string, string>, method = 'GET') =>
  ({ headers: { host: '127.0.0.1:5173', ...headers }, method }) as unknown as IncomingMessage;

describe('the /api gate', () => {
  it('this machine, same origin: allowed -- local use is unchanged', () => {
    expect(check(req({ origin: 'http://127.0.0.1:5173' }, 'POST'), '/api/slack/dm-send', true).ok).toBe(true);
    expect(check(req({}), '/api/slack/status', true).ok).toBe(true);
  });

  it('🛑 another website posting at localhost is refused -- CORS stops the read, not the send', () => {
    const v = check(req({ origin: 'https://evil.example', 'content-type': 'application/json' }, 'POST'), '/api/slack/dm-send', true);
    expect(v).toMatchObject({ ok: false, status: 403 });
    expect(check(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' }, 'POST'), '/api/assistant', true).ok).toBe(false);
    /* Another port on localhost is same-site, not same-origin -- also refused. */
    expect(check(req({ origin: 'http://localhost:3000' }, 'POST'), '/api/assistant', true).ok).toBe(false);
  });

  it('a top-level navigation back from an OAuth provider is allowed', () => {
    expect(check(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }), '/api/connect/callback', true).ok).toBe(true);
  });

  it('🛑 the no-preflight shapes (text/plain, form) are refused on POST', () => {
    expect(check(req({ 'content-type': 'text/plain', 'content-length': '5' }, 'POST'), '/api/assistant', true))
      .toMatchObject({ ok: false, status: 415 });
    expect(check(req({ 'content-type': 'application/x-www-form-urlencoded', 'content-length': '5' }, 'POST'), '/api/slack/messages', true).ok).toBe(false);
    expect(check(req({ 'content-type': 'application/json; charset=utf-8', 'content-length': '5' }, 'POST'), '/api/assistant', true).ok).toBe(true);
  });

  it('🛑 signed out: every route refused -- on this machine too', () => {
    expect(check(req({}), '/api/slack/people', false)).toMatchObject({ ok: false, status: 401 });
    expect(check(req({ 'content-type': 'application/json', 'content-length': '2' }, 'POST'), '/api/assistant', false).ok).toBe(false);
    expect(check(req({ host: 'abc.trycloudflare.com', 'cf-connecting-ip': '1.2.3.4' }), '/api/meta/data', false).ok).toBe(false);
  });

  it('signing in, Slack events and OAuth callbacks need no session -- each is verified another way', () => {
    const remote = { host: 'abc.trycloudflare.com', 'cf-connecting-ip': '1.2.3.4' };
    expect(check(req({ 'content-type': 'application/json', 'content-length': '2' }, 'POST'), '/api/auth/login', false).ok).toBe(true);
    expect(check(req({}), '/api/auth/me', false).ok).toBe(true);
    expect(check(req({ ...remote, 'content-type': 'application/json', 'content-length': '2' }, 'POST'), '/api/slack/events', false).ok).toBe(true);
    expect(check(req(remote), '/api/slack/callback', false).ok).toBe(true);
    expect(check(req(remote), '/api/connect/callback', false).ok).toBe(true);
    /* A prefix is not a path: /api/authx is not /api/auth/. */
    expect(check(req({}), '/api/authx', false).ok).toBe(false);
  });

  it('"local" means loopback AND no proxy headers -- a tunnel request with a loopback Host is still remote', () => {
    expect(isLocal(req({}))).toBe(true);
    expect(isLocal(req({ host: 'localhost:5173' }))).toBe(true);
    expect(isLocal(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe(false);
    expect(isLocal(req({ host: 'abc.trycloudflare.com' }))).toBe(false);
  });
});

/** A fake request that emits the given chunks. */
function stream(chunks: string[]): IncomingMessage {
  const e = Object.assign(new EventEmitter(), { destroy: () => {} }) as unknown as IncomingMessage;
  queueMicrotask(() => {
    for (const c of chunks) e.emit('data', Buffer.from(c));
    e.emit('end');
  });
  return e;
}

describe('request bodies', () => {
  it('🛑 over the limit rejects -- it does not buffer gigabytes', async () => {
    await expect(readRaw(stream(['x'.repeat(600), 'x'.repeat(600)]), 1000)).rejects.toBeInstanceOf(BodyTooLarge);
  });
  it('a client aborting mid-body rejects instead of hanging', async () => {
    const e = new EventEmitter() as unknown as IncomingMessage;
    queueMicrotask(() => e.emit('aborted'));
    await expect(readRaw(e)).rejects.toThrow(/aborted/);
  });
  it('JSON that is not an object reads as {} -- callers validate fields', async () => {
    expect(await readJson(stream(['[1,2]']))).toEqual({});
    expect(await readJson(stream(['not json']))).toEqual({});
    expect(await readJson(stream(['{"question":"hi"}']))).toEqual({ question: 'hi' });
  });
  it('HTML escaping covers everything a provider error could inject', () => {
    expect(escapeHtml('<script>"x"&\'y\'</script>')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;');
  });
});
