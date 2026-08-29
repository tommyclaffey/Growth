import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Slack Events — the push half of real-time.
 *
 * Polling asks "anything new?" every fifteen seconds. Events invert it: Slack
 * posts to this endpoint the instant a message lands. That endpoint is public,
 * which is the whole security problem — anyone who finds the URL can post to
 * it, so every request is verified against Slack's signature before it is
 * believed.
 */

/* ---------- signature verification ---------- */

/**
 * Slack signs each request with an HMAC over `v0:timestamp:rawBody`.
 *
 * Two things this must get right, and both are easy to miss:
 *   - the RAW body, byte for byte. Parsing to JSON and re-serialising changes
 *     key order and whitespace, and the hash stops matching for a request that
 *     is perfectly valid.
 *   - a timing-safe compare. A plain `===` leaks how much of the signature was
 *     correct through how long the comparison took, which is enough to forge
 *     one a byte at a time.
 */
export function verifySlack(rawBody: string, headers: IncomingMessage['headers'], signingSecret: string): boolean {
  const sig = headers['x-slack-signature'];
  const ts = headers['x-slack-request-timestamp'];
  if (typeof sig !== 'string' || typeof ts !== 'string') return false;

  /* Reject anything older than five minutes. Without this a captured request
     stays replayable forever — the signature never expires on its own. */
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const expected = 'v0=' + createHmac('sha256', signingSecret).update(`v0:${ts}:${rawBody}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ---------- subscriber bus ---------- */

/**
 * Open browser connections, held so a Slack event can be pushed to them.
 *
 * A browser cannot receive a webhook, so the push has to be relayed: Slack →
 * this server → an open connection to the page. Server-Sent Events rather than
 * a WebSocket because the traffic is one-directional and SSE reconnects on its
 * own.
 */
const subscribers = new Set<ServerResponse>();

export function addSubscriber(res: ServerResponse) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    /* Proxies buffer streamed responses by default, which turns "instant" into
       "whenever the buffer fills". */
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  subscribers.add(res);

  /* A silent connection gets closed by intermediaries. A comment line every 25s
     keeps it open and costs nothing. */
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* closed */ }
  }, 25000);

  res.on('close', () => {
    clearInterval(ping);
    subscribers.delete(res);
  });
}

export function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers) {
    try { res.write(payload); } catch { subscribers.delete(res); }
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}

/* ---------- raw body ---------- */

/** Read the body as bytes. The signature is computed over exactly this. */
export function rawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}
