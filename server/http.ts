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
