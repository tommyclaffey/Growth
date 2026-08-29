import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';
import {
  activeWorkspace, publicView, removeWorkspace, saveWorkspace, setActive, setChannel, setLink,
} from './slackStore.js';
import { addSubscriber, broadcast, rawBody, verifySlack } from './slackEvents.js';

/**
 * Slack — multi-workspace, via OAuth.
 *
 * Anyone can connect their own workspace: they hit /api/slack/install, approve
 * in Slack, and their bot token is stored server-side against their team id.
 * No token ever reaches the browser.
 *
 * WHAT MAKES THIS SHAREABLE RATHER THAN PERSONAL:
 *   - the app holds a client id + secret, not one workspace's bot token
 *   - each install writes its own token, keyed by team
 *   - the panel reads whichever workspace is active
 *
 * ⚠️ Two things stand between this and other people actually using it:
 *   1. the redirect URL must be public HTTPS — Slack will not send a browser
 *      back to your laptop, so this needs a tunnel in dev and a host in prod
 *   2. the token store is a local file (see slackStore.ts) — it has to become a
 *      database before it survives a deploy
 */

const SLACK = 'https://slack.com/api';

/* What the bot needs. Keep this list as short as it can be — every scope is
   something a stranger is being asked to hand over. */
const SCOPES = [
  'channels:history',
  'channels:read',
  /* Without this, conversations.join fails and every read comes back
     `not_in_channel` — which reads as a broken token rather than a missing
     invite. The scope list was one entry short and nothing said so. */
  'channels:join',
  /* Direct messages and group DMs are separate conversation types in Slack
     with separate scopes; a token that reads public channels cannot see either. */
  'im:read', 'im:write', 'im:history',
  'mpim:read', 'mpim:write', 'mpim:history',
  /* Private channels the bot has been invited to. */
  'groups:read', 'groups:history',
  'users:read',
  'chat:write',
].join(',');

/** Pending OAuth states. In-memory is correct here: they expire in minutes and
    surviving a restart is not a property you want from a CSRF nonce. */
const pendingStates = new Map<string, number>();
const STATE_TTL = 10 * 60 * 1000;

function newState(): string {
  const s = randomBytes(16).toString('hex');
  pendingStates.set(s, Date.now() + STATE_TTL);
  for (const [k, exp] of pendingStates) if (exp < Date.now()) pendingStates.delete(k);
  return s;
}
function consumeState(s: string | null): boolean {
  if (!s) return false;
  const exp = pendingStates.get(s);
  pendingStates.delete(s);
  return Boolean(exp && exp > Date.now());
}

/**
 * Form-encoded, not JSON.
 *
 * Slack's Web API is not uniform about this. `conversations.history` accepts a
 * JSON body; `users.info` ignores it and answers `user_not_found` for a user
 * that plainly exists — a wrong answer rather than an error, so the failure
 * looked like a missing person instead of a wrong Content-Type. Form encoding
 * works for every method here, so there is no reason to guess per method.
 */
async function slack<T>(method: string, token: string, body: Record<string, unknown> = {}): Promise<T> {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));
  const res = await fetch(`${SLACK}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const json = (await res.json()) as { ok: boolean; error?: string };
  /* Slack answers HTTP 200 for a bad token, a missing scope, and a channel the
     bot was never invited to. The failure is in the body, so `res.ok` alone
     reports success on all three. */
  if (!json.ok) throw new Error(`slack.${method}: ${json.error ?? 'unknown_error'}`);
  return json as T;
}

/* ---------- users ---------- */

interface SlackUser {
  id: string; name: string; initials: string; hue: 0 | 1 | 2 | 3;
  /** Slack profile picture, when the person has set one. */
  avatar?: string;
}
const userCache = new Map<string, SlackUser>();

function hueFor(id: string): 0 | 1 | 2 | 3 {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 4) as 0 | 1 | 2 | 3;
}
function initialsFrom(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '??';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}
async function resolveUser(id: string, token: string): Promise<SlackUser> {
  const key = `${token.slice(-8)}:${id}`; // cache per workspace, not globally
  const hit = userCache.get(key);
  if (hit) return hit;
  let u: SlackUser;
  try {
    const r = await slack<{
      user: {
        real_name?: string;
        profile?: {
          display_name?: string; real_name?: string;
          image_72?: string; image_192?: string; image_512?: string;
        };
      };
    }>('users.info', token, { user: id });
    const prof = r.user.profile;
    const name = prof?.display_name?.trim() || prof?.real_name?.trim()
      || r.user.real_name?.trim() || id;
    /* 192 rather than 72: the panel renders at 28 CSS px, which is 56 physical
       on a 2x display, and Slack's 72 is visibly soft once it is a circle.
       Falls through the sizes because not every account has every one. */
    const avatar = prof?.image_192 || prof?.image_512 || prof?.image_72;
    u = { id, name, initials: initialsFrom(name), hue: hueFor(id), avatar };
  } catch {
    /* Deleted user, or users:read not granted. The message still exists — show
       it rather than dropping it.

       Deliberately NOT cached: caching a failure makes it permanent for the
       life of the process, so one bad call during setup left a real person
       rendering as their raw id forever, with no way to recover but a restart. */
    return { id, name: id, initials: '??', hue: hueFor(id) };
  }
  userCache.set(key, u);
  return u;
}

/**
 * Who this app is, in a given workspace.
 *
 * Needed to tell apart a message a human typed in Slack from one Growth posted
 * itself. Both arrive through conversations.history and look alike, so marking
 * everything `fromSlack` badged Growth's own messages as having come from
 * somewhere else.
 */
const identityCache = new Map<string, { userId?: string; botId?: string }>();
async function selfIdentity(token: string) {
  const key = token.slice(-8);
  const hit = identityCache.get(key);
  if (hit) return hit;
  try {
    const r = await slack<{ user_id?: string; bot_id?: string }>('auth.test', token);
    const id = { userId: r.user_id, botId: r.bot_id };
    identityCache.set(key, id);
    return id;
  } catch {
    return {};
  }
}

const clock = (ts: string) =>
  new Date(Number(ts.split('.')[0]) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const minutesAgo = (ts: string) => Math.round((Date.now() - Number(ts.split('.')[0]) * 1000) / 60000);

async function render(text: string, token: string): Promise<string> {
  let out = text;
  for (const m of text.matchAll(/<@([UW][A-Z0-9]+)>/g)) {
    out = out.replace(m[0], `@${(await resolveUser(m[1], token)).name}`);
  }
  return out
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^|>]+)>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/* ---------- http ---------- */

/**
 * A shared metric, as Slack Block Kit.
 *
 * NOT a rendered image. An image of a number is the worst of both: it cannot be
 * selected, searched, or read by a screen reader; it ignores the reader's
 * theme; it is stale the moment it is posted; and producing one means running a
 * browser server-side per message. Blocks are native Slack — live text, real
 * dark mode, and the colour bar carries the channel identity the dot carries in
 * Growth.
 *
 * The numbers come from the dashboard's own functions, so a card in Slack and
 * the same card in Growth cannot disagree.
 */
interface MetricsMod {
  totals: (scope: string, range: number) => Record<string, number>;
  delta: (scope: string, metric: string, range: number) => number;
  formatMetric: (metric: string, value: number) => string;
  CHANNEL_LABEL: Record<string, string>;
}

const CHANNEL_HEX: Record<string, string> = {
  all: '#635BFF', meta: '#635BFF', tiktok: '#12A5A0', youtube: '#E0952A',
  affiliates: '#D65B9A', paidSearch: '#5B7089', podcasts: '#8B6CF0',
};

function metricValue(t: Record<string, number>, metric: string): number {
  const key = metric.toLowerCase();
  return key === 'sales' ? t.sales : (t[key] ?? 0);
}

function buildMetricBlocks(
  m: MetricsMod, view: { channel: string; metric: string; range: number }, note: string, link: string,
) {
  const t = m.totals(view.channel, view.range);
  const value = m.formatMetric(view.metric, metricValue(t, view.metric));
  const d = m.delta(view.channel, view.metric, view.range);
  const scopeLabel = view.channel === 'all' ? 'All channels' : (m.CHANNEL_LABEL[view.channel] ?? view.channel);

  /* Zero is not a direction — the same rule the badge follows in the app. A
     card that reads "flat" here and "up" there is two answers to one question. */
  const trend = d === 0 ? 'no change' : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}%`;
  const isRatio = view.metric === 'CAC' || view.metric === 'ROAS';

  return [{
    color: CHANNEL_HEX[view.channel] ?? '#635BFF',
    blocks: [
      ...(note ? [{ type: 'section', text: { type: 'mrkdwn', text: note } }] : []),
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${view.metric}*  ${value}   _${trend}_` },
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: isRatio
            ? `${scopeLabel} · Last ${view.range} days · ratio, computed from the period, not summed`
            : `${scopeLabel} · Last ${view.range} days`,
        }],
      },
      {
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: 'Open in Growth' },
          url: link,
        }],
      },
    ],
  }];
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const c: Buffer[] = [];
  for await (const x of req) c.push(x as Buffer);
  try { return JSON.parse(Buffer.concat(c).toString('utf8')); } catch { return {}; }
}
function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}
function redirect(res: ServerResponse, to: string) {
  res.statusCode = 302;
  res.setHeader('Location', to);
  res.end();
}
function page(res: ServerResponse, title: string, msg: string) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font:15px/1.5 -apple-system,system-ui,sans-serif;padding:48px;max-width:34em;color:#16161c">
<h1 style="font-size:19px">${title}</h1><p style="color:#5a5a68">${msg}</p>
<p><a href="/Growth/" style="color:#635BFF">Back to Growth</a></p>`);
}

export function slackApi(): Plugin {
  return {
    name: 'growth-slack-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/slack', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const path = url.pathname.replace(/\/$/, '');
        const clientId = process.env.SLACK_CLIENT_ID;
        const clientSecret = process.env.SLACK_CLIENT_SECRET;
        const redirectUri = process.env.SLACK_REDIRECT_URI;

        try {
          /* ---- events: Slack pushes here ----
             Must come before anything that reads the body another way — the
             signature is computed over the raw bytes, so this route has to be
             the one that reads them. */
          if (req.method === 'POST' && path === '/events') {
            const signingSecret = process.env.SLACK_SIGNING_SECRET;
            const body = await rawBody(req);

            if (!signingSecret) {
              server.config.logger.warn('[slack] event received but SLACK_SIGNING_SECRET is unset');
              return send(res, 503, { error: 'no_signing_secret' });
            }
            if (!verifySlack(body, req.headers, signingSecret)) {
              /* Unsigned or stale. This endpoint is public, so an unverified
                 request is the expected attack, not an edge case. */
              server.config.logger.warn('[slack] rejected an unverified event');
              return send(res, 401, { error: 'bad_signature' });
            }

            const evt = JSON.parse(body) as {
              type: string; challenge?: string;
              event?: { type: string; subtype?: string; channel?: string; user?: string; bot_id?: string };
            };

            /* Slack proves you own the URL by posting a challenge it expects
               echoed back verbatim. */
            if (evt.type === 'url_verification' && evt.challenge) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/plain');
              return res.end(evt.challenge);
            }

            const ws = activeWorkspace();
            if (evt.event?.type === 'message' && ws?.channelId && evt.event.channel === ws.channelId) {
              /* Tell the browser something changed and let it re-read, rather
                 than pushing the message itself. One code path builds a
                 message — if the event pushed its own shape there would be two,
                 and they would drift. */
              broadcast('message', { channel: evt.event.channel });
            }

            /* Slack retries anything that is not answered within 3 seconds, so
               acknowledge immediately and never block on work. */
            return send(res, 200, { ok: true });
          }

          /* ---- stream: the browser listens here ---- */
          if (req.method === 'GET' && path === '/stream') {
            return addSubscriber(res);
          }

          /* ---- status: what the client is allowed to know ---- */
          if (req.method === 'GET' && (path === '' || path === '/status')) {
            const ws = activeWorkspace();
            return send(res, 200, {
              configured: Boolean(clientId && clientSecret && redirectUri),
              realtime: Boolean(process.env.SLACK_SIGNING_SECRET),
              connected: Boolean(ws?.channelId),
              available: Boolean(ws?.channelId),
              ...publicView(),
            });
          }

          /* ---- install: hand the user off to Slack ---- */
          if (req.method === 'GET' && path === '/install') {
            if (!clientId || !redirectUri) {
              return page(res, 'Slack is not set up yet',
                'SLACK_CLIENT_ID and SLACK_REDIRECT_URI are missing from .env.local.');
            }
            const auth = new URL('https://slack.com/oauth/v2/authorize');
            auth.searchParams.set('client_id', clientId);
            auth.searchParams.set('scope', SCOPES);
            auth.searchParams.set('redirect_uri', redirectUri);
            auth.searchParams.set('state', newState());
            return redirect(res, auth.toString());
          }

          /* ---- callback: Slack sends the user back with a code ---- */
          if (req.method === 'GET' && path === '/callback') {
            if (url.searchParams.get('error')) {
              return page(res, 'Connection cancelled', 'Slack was not connected. You can try again any time.');
            }
            if (!consumeState(url.searchParams.get('state'))) {
              /* An unrecognised state means this callback did not start here.
                 Rejecting it is what stops someone else's install being
                 attached to this app. */
              return page(res, 'Could not verify that request',
                'The sign-in link expired or did not originate here. Start again from Growth.');
            }
            const code = url.searchParams.get('code');
            if (!code || !clientId || !clientSecret || !redirectUri) {
              return page(res, 'Missing details', 'No authorisation code came back from Slack.');
            }

            /* oauth.v2.access is the one Slack call that uses form encoding and
               no bearer token — the client secret is the credential here. */
            const r = await fetch(`${SLACK}/oauth.v2.access`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }),
            });
            const data = (await r.json()) as {
              ok: boolean; error?: string; access_token?: string;
              team?: { id: string; name: string }; authed_user?: { id: string };
            };
            if (!data.ok || !data.access_token || !data.team) {
              return page(res, 'Slack refused the connection', data.error ?? 'unknown_error');
            }

            saveWorkspace({
              teamId: data.team.id,
              teamName: data.team.name,
              accessToken: data.access_token,
              installedBy: data.authed_user?.id,
              connectedAt: new Date().toISOString(),
            });
            return redirect(res, '/Growth/?slack=connected');
          }

          /* Everything past here needs a connected workspace. */
          const ws = activeWorkspace();
          if (!ws) return send(res, 503, { error: 'not_connected', message: 'No Slack workspace connected.' });

          /* ---- every conversation the bot can see ---- */
          if (req.method === 'GET' && path === '/conversations') {
            const self = await selfIdentity(ws.accessToken);
            const r = await slack<{
              channels: {
                id: string; name?: string; is_member?: boolean; is_im?: boolean;
                is_mpim?: boolean; is_private?: boolean; user?: string;
              }[];
            }>('conversations.list', ws.accessToken, {
              types: 'public_channel,private_channel,mpim,im',
              limit: 200, exclude_archived: true,
            });

            const out = [];
            for (const c of r.channels) {
              if (c.is_im) {
                /* A DM has no name — it is identified by the person on the
                   other end, so it has to be resolved to one. */
                if (!c.user || c.user === self.userId) continue;
                const u = await resolveUser(c.user, ws.accessToken);
                out.push({ id: c.id, kind: 'dm', name: u.name, userId: u.id, avatar: u.avatar, joined: true });
              } else if (c.is_mpim) {
                out.push({ id: c.id, kind: 'group', name: (c.name ?? '').replace(/^mpdm-|-1$/g, '').replace(/--/g, ', '), joined: true });
              } else {
                out.push({
                  id: c.id, kind: c.is_private ? 'private' : 'channel',
                  name: c.name ?? c.id, joined: Boolean(c.is_member),
                });
              }
            }
            /* Joined first: a conversation the bot is not in reads as
               `not_in_channel`, which looks like a broken token. */
            out.sort((a, b) => Number(b.joined) - Number(a.joined) || a.name.localeCompare(b.name));
            return send(res, 200, { conversations: out });
          }

          /* ---- the people directory, for starting a DM and for @-mentions ---- */
          if (req.method === 'GET' && path === '/people') {
            const self = await selfIdentity(ws.accessToken);
            const r = await slack<{
              members: {
                id: string; deleted?: boolean; is_bot?: boolean; real_name?: string;
                profile?: { display_name?: string; real_name?: string; image_192?: string; image_72?: string };
              }[];
            }>('users.list', ws.accessToken, { limit: 400 });
            const people = r.members
              /* Deactivated accounts and Slackbot are not people you can talk to. */
              .filter((m) => !m.deleted && !m.is_bot && m.id !== 'USLACKBOT' && m.id !== self.userId)
              .map((m) => {
                const name = m.profile?.display_name?.trim() || m.profile?.real_name?.trim()
                  || m.real_name?.trim() || m.id;
                return {
                  id: m.id, name, initials: initialsFrom(name), hue: hueFor(m.id),
                  avatar: m.profile?.image_192 || m.profile?.image_72,
                };
              })
              .sort((a, b) => a.name.localeCompare(b.name));
            return send(res, 200, { people });
          }

          /* ---- open (or reopen) a DM with one or more people ---- */
          if (req.method === 'POST' && path === '/dm') {
            const { userIds } = await readBody(req);
            if (!Array.isArray(userIds) || userIds.length === 0) {
              return send(res, 400, { error: 'userIds required' });
            }
            /* conversations.open is idempotent — the same set of people always
               returns the same conversation, so this both creates and finds. */
            const r = await slack<{ channel: { id: string } }>('conversations.open', ws.accessToken, {
              users: userIds.join(','),
            });
            return send(res, 200, { id: r.channel.id });
          }

          /* ---- channels the bot can actually read ---- */
          if (req.method === 'GET' && path === '/channels') {
            const r = await slack<{ channels: { id: string; name: string; is_member: boolean }[] }>(
              'conversations.list', ws.accessToken,
              { types: 'public_channel', limit: 200, exclude_archived: true });
            return send(res, 200, {
              channels: r.channels
                .map((c) => ({ id: c.id, name: c.name, joined: c.is_member }))
                /* Joined first — those are the ones that will actually work.
                   A channel the bot is not in reads as `not_in_channel`, which
                   looks like a broken token rather than a missing invite. */
                .sort((a, b) => Number(b.joined) - Number(a.joined) || a.name.localeCompare(b.name)),
            });
          }

          if (req.method === 'POST' && path === '/channel') {
            const { channelId, channelName, kind } = await readBody(req);
            if (typeof channelId !== 'string') return send(res, 400, { error: 'channelId required' });
            /* Join so reads work. `already_in_channel` is a success; anything
               else is not, and a bare catch here hid a missing scope behind a
               green checkmark — the channel saved, the UI said connected, and
               every subsequent read failed. */
            let joinWarning: string | null = null;
            /* Only public channels can be joined. A DM or group DM is opened,
               not joined, and calling join on one is an error rather than a
               no-op — so it is not attempted. */
            const joinable = !kind || kind === 'channel';
            try {
              if (joinable) await slack('conversations.join', ws.accessToken, { channel: channelId });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (!msg.includes('already_in_channel')) {
                joinWarning = msg.includes('missing_scope')
                  ? `Growth could not join #${channelName}. Invite it in Slack: /invite @Growth`
                  : msg;
                server.config.logger.warn(`[slack] join failed: ${msg}`);
              }
            }
            setChannel(ws.teamId, channelId, typeof channelName === 'string' ? channelName : channelId,
                       typeof kind === 'string' ? kind : 'channel');
            return send(res, 200, { ok: true, warning: joinWarning });
          }

          if (req.method === 'POST' && path === '/link') {
            const { personId, slackUserId } = await readBody(req);
            if (typeof personId !== 'string') return send(res, 400, { error: 'personId required' });
            setLink(ws.teamId, personId, typeof slackUserId === 'string' ? slackUserId : null);
            return send(res, 200, { ok: true });
          }

          if (req.method === 'POST' && path === '/active') {
            const { teamId } = await readBody(req);
            if (typeof teamId === 'string') setActive(teamId);
            return send(res, 200, { ok: true });
          }

          if (req.method === 'POST' && path === '/disconnect') {
            const { teamId } = await readBody(req);
            removeWorkspace(typeof teamId === 'string' ? teamId : ws.teamId);
            return send(res, 200, { ok: true });
          }

          /* ---- messages ---- */
          if (!ws.channelId) return send(res, 503, { error: 'no_channel', message: 'Pick a channel first.' });

          if (req.method === 'GET' && path === '/messages') {
            const r = await slack<{ messages: { subtype?: string; user?: string; bot_id?: string; text?: string; ts: string }[] }>(
              'conversations.history', ws.accessToken, { channel: ws.channelId, limit: 40 });
            const self = await selfIdentity(ws.accessToken);
            /* Reverse the person -> Slack map so a Slack author can be resolved
               back to the local person they are. Without it the same human is
               two directory entries with two names and two photos, and a
               message from one is not recognisably from the other. */
            const bySlackId: Record<string, string> = {};
            for (const [personId, slackId] of Object.entries(ws.links ?? {})) bySlackId[slackId] = personId;

            const members: Record<string, SlackUser> = {};
            const messages = [];
            for (const m of [...r.messages].reverse()) {
              if (m.subtype === 'channel_join' || m.subtype === 'channel_leave' || !m.text) continue;
              const u = await resolveUser(m.user ?? m.bot_id ?? 'unknown', ws.accessToken);
              members[u.id] = u;
              /* The badge means "this was written in Slack, not here". A message
                 Growth posted came from here, so it does not get one — even
                 though it is read back out of Slack like everything else. */
              const isOwn = (self.userId && m.user === self.userId) || (self.botId && m.bot_id === self.botId);
              /* A linked Slack account speaks as its local person. */
              const authorId = bySlackId[u.id] ?? u.id;
              messages.push({
                id: m.ts, authorId, body: await render(m.text, ws.accessToken),
                time: clock(m.ts), minutesAgo: minutesAgo(m.ts),
                fromSlack: !isOwn,
              });
            }
            return send(res, 200, {
              messages, members,
              team: ws.teamName, channel: ws.channelName,
              channelId: ws.channelId, channelKind: ws.channelKind ?? 'channel',
            });
          }

          if (req.method === 'POST' && path === '/messages') {
            const { text, view, link } = await readBody(req);
            if (typeof text !== 'string' || !text.trim()) return send(res, 400, { error: 'Text required.' });

            const payload: Record<string, unknown> = { channel: ws.channelId, text };

            if (view && typeof view === 'object' && typeof link === 'string') {
              const v = view as { channel: string; metric: string; range: number };
              const m = (await server.ssrLoadModule('/src/data/metrics.ts')) as unknown as MetricsMod;
              /* `text` stays as the notification fallback — it is what shows in
                 the sidebar and in push notifications, where blocks do not
                 render at all. */
              payload.text = text.replace(link, '').trim() || `${v.metric} · ${v.channel}`;
              payload.attachments = JSON.stringify(buildMetricBlocks(m, v, '', link));
            }

            const r = await slack<{ ts: string }>('chat.postMessage', ws.accessToken, payload);
            return send(res, 200, { ok: true, ts: r.ts });
          }

          return send(res, 404, { error: 'unknown_route', path });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[slack] ${message}`);
          /* `not_in_channel` is not a failure the user can debug from the word
             itself — it means one specific thing with one specific fix. Say the
             fix. */
          if (message.includes('not_in_channel')) {
            return send(res, 409, {
              error: 'not_in_channel',
              message: 'Growth is not in that channel yet. In Slack, type /invite @Growth in it.',
            });
          }
          return send(res, 500, { error: 'slack_failed', message });
        }
      });
    },
  };
}
