import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The request plumbing every /api plugin shares.
 *
 * Each plugin used to carry its own copy of readBody/send, and every copy had
 * the same two holes: no size limit (one multi-gigabyte POST exhausts memory)
 * and no error handler (a client aborting mid-body left the request hanging,
 * or crashed the dev server with an unhandled rejection). Fixed once, here.
 */

/** 1 MB. The largest legitimate body -- an assistant question with its findings -- is ~50 KB. */
export const MAX_BODY = 1_000_000;

export class BodyTooLarge extends Error {
  constructor() { super('Request body too large.'); }
}

/** The raw bytes, capped. Rejects -- never hangs -- on abort or overflow. */
export function readRaw(req: IncomingMessage, limit = MAX_BODY): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const fail = (e: Error) => { if (!done) { done = true; reject(e); } };
    req.on('data', (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        fail(new BodyTooLarge());
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', fail);
    req.on('aborted', () => fail(new Error('Request aborted.')));
  });
}

/** A JSON object body. Anything that is not an object reads as {} -- callers validate fields. */
export async function readJson(req: IncomingMessage, limit = MAX_BODY): Promise<Record<string, unknown>> {
  const raw = await readRaw(req, limit);
  try {
    const v = JSON.parse(raw.toString('utf8') || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  } catch { return {}; }
}

export function send(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) { res.end(); return; }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/** For anything a provider or a query string puts into an HTML page. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}

/** Path of a request, or null for a URL that does not parse. Never throws. */
export function pathOf(req: IncomingMessage): URL | null {
  try { return new URL(req.url ?? '/', 'http://placeholder'); } catch { return null; }
}

/** Every outbound call gets a deadline -- a hung upstream must not hold a request open forever. */
export const TIMEOUT_MS = 20_000;
export const deadline = () => AbortSignal.timeout(TIMEOUT_MS);

/**
 * `new URL(req.url, 'http://localhost')` needs a base to parse a path-only URL,
 * but that base is a placeholder — it is not where the request came from. Using
 * its origin drops the port locally and the whole hostname behind the tunnel,
 * and the redirect_uri has to match the registered one byte for byte, so every
 * provider would reject the handshake.
 */
export function originOf(req: { headers: Record<string, unknown> }): string {
  /* 🛑 The Host / X-Forwarded-Host headers are caller-controlled. A fixed
     PUBLIC_ORIGIN wins when set; otherwise the host must at least LOOK like a
     host, or it falls back to localhost -- it is reflected into a page. */
  if (process.env.PUBLIC_ORIGIN) return process.env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const raw = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '');
  const host = /^[a-z0-9.-]+(:\d+)?$/i.test(raw) ? raw : undefined;
  const fwd = req.headers['x-forwarded-proto'];
  const proto = (fwd === 'https' || fwd === 'http' ? fwd : undefined)
    ?? (host && !/^localhost|^127\./.test(host) ? 'https' : 'http');
  return `${proto}://${host ?? 'localhost:5173'}`;
}


const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

/** Came from this machine, not through a tunnel or proxy. */
export function isLocal(req: IncomingMessage): boolean {
  const h = req.headers;
  if (h['cf-connecting-ip'] || h['x-forwarded-for'] || h['x-forwarded-host']) return false;
  return LOOPBACK.test(String(h.host ?? ''));
}

export function cookieOf(req: IncomingMessage, name: string): string | undefined {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) {
      try { return decodeURIComponent(v.join('=')); } catch { return undefined; }
    }
  }
  return undefined;
}
