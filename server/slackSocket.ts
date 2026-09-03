import { broadcast, noteEvent } from './slackEvents.js';

/**
 * Socket Mode — Slack pushes events over a WebSocket we dial OUT to.
 *
 * The HTTP Events API needs Slack to reach us, which on a laptop means a
 * tunnel. Quick tunnels mint a NEW random hostname every restart, so the
 * registered Request URL goes stale the moment the machine sleeps or the
 * process bounces -- and nothing announces it. Events simply stop, the
 * counters flatline, and it looks like a code bug. That happened here twice.
 *
 * Socket Mode inverts the direction: the connection is outbound, so there is
 * no public URL to register, nothing to re-register when it changes, and no
 * request signature to verify (the socket is authenticated once, by the
 * app-level token). The tunnel stops being load-bearing for realtime.
 *
 * Requires an app-level token (xapp-...) with `connections:write`, created
 * once under Basic Information -> App-Level Tokens.
 */

type Log = { info: (m: string) => void; warn: (m: string) => void };

/** What Slack sends down the socket. Only two envelope types matter here. */
interface Envelope {
  type: string;
  envelope_id?: string;
  payload?: { event?: { type?: string; channel?: string; subtype?: string } };
  reason?: string;
}

let socket: WebSocket | null = null;
let stopped = false;
let attempt = 0;
let connected = false;

export function socketConnected(): boolean {
  return connected;
}

/**
 * Open the socket and keep it open.
 *
 * `apps.connections.open` returns a short-lived, single-use WSS URL, so a
 * reconnect must ask for a NEW one -- reusing the old URL fails and looks
 * like the token is broken.
 */
export async function startSocketMode(appToken: string, log: Log): Promise<void> {
  stopped = false;
  await connect(appToken, log);
}

export function stopSocketMode() {
  stopped = true;
  try { socket?.close(); } catch { /* already gone */ }
  socket = null;
  connected = false;
}

async function connect(appToken: string, log: Log): Promise<void> {
  if (stopped) return;

  let url: string;
  try {
    const res = await fetch('https://slack.com/api/apps.connections.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${appToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const body = (await res.json()) as { ok: boolean; url?: string; error?: string };
    if (!body.ok || !body.url) {
      /* A bad app token is permanent -- retrying it forever just fills the
         log. Say what is wrong once and stop. */
      log.warn(`[slack] socket mode could not open: ${body.error ?? 'unknown'}. `
        + 'Check SLACK_APP_TOKEN is an xapp- token with connections:write.');
      if (body.error === 'invalid_auth' || body.error === 'not_authed') return;
      return void retry(appToken, log);
    }
    url = body.url;
  } catch (err) {
    log.warn(`[slack] socket mode handshake failed: ${err instanceof Error ? err.message : String(err)}`);
    return void retry(appToken, log);
  }

  const ws = new WebSocket(url);
  socket = ws;

  ws.addEventListener('open', () => {
    attempt = 0;
    connected = true;
    log.info('[slack] socket mode connected — realtime no longer depends on the tunnel');
  });

  ws.addEventListener('message', (ev: MessageEvent) => {
    let env: Envelope;
    try { env = JSON.parse(String(ev.data)) as Envelope; } catch { return; }

    /* Slack asks for an ack within seconds and REDELIVERS anything unacked,
       so this goes first and never waits on the work below. */
    if (env.envelope_id) {
      try { ws.send(JSON.stringify({ envelope_id: env.envelope_id })); } catch { /* closing */ }
    }

    if (env.type === 'disconnect') {
      /* Routine: Slack cycles sockets for maintenance. Expected, not an error. */
      log.info(`[slack] socket mode asked to reconnect (${env.reason ?? 'no reason given'})`);
      try { ws.close(); } catch { /* already closing */ }
      return;
    }

    if (env.type === 'events_api' && env.payload?.event) {
      /* Counted at the transport, because the counter answers "did Slack
         reach us at all" -- including with something we do not handle.
         Counting inside handleEvent would silently drop non-message events
         from the tally and reintroduce the blind spot it was added to fix. */
      noteEvent(env.payload.event.type ?? 'events_api');
      handleEvent(env.payload.event);
    }
  });

  const reopen = () => {
    connected = false;
    if (socket === ws) socket = null;
    retry(appToken, log);
  };
  ws.addEventListener('close', reopen);
  ws.addEventListener('error', () => { /* close always follows */ });
}

/** Exponential backoff, capped. A tight loop against a down Slack helps nobody. */
function retry(appToken: string, log: Log) {
  if (stopped) return;
  attempt += 1;
  const wait = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
  setTimeout(() => { void connect(appToken, log); }, wait);
}

/**
 * ONE handler for both transports.
 *
 * The HTTP route calls this too. Two copies would drift -- and the shape of
 * that drift is exactly the bug this project keeps producing: a second read
 * path that inherits the first one's blind spots without inheriting its fixes.
 */
export function handleEvent(event: { type?: string; channel?: string; subtype?: string }) {
  if (event.type !== 'message' || !event.channel) return;
  /* A nudge naming the channel, never the message itself. The client already
     knows how to read a channel; a second message-building path here would
     drift from the one that exists. */
  broadcast('message', { channel: event.channel });
}
