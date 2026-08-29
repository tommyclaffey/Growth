import { ME, MEMBERS, SEED, decodeView, encodeView, type Member, type Message, type ViewRef } from './chat';

/**
 * Slack, multi-workspace.
 *
 * `/api/slack` only exists on the dev server, so a deployed build silently
 * keeps the seeded thread. The safe thing is what happens when nothing is
 * configured.
 */

export type ChatSource = 'slack' | 'seed';

export interface WorkspaceSummary {
  teamId: string;
  teamName: string;
  channelId: string | null;
  channelName: string | null;
  channelKind?: string;
  /** Local person id -> Slack user id. */
  links?: Record<string, string>;
}

export interface SlackStatus {
  /** Slack can push to us — the signing secret is set. */
  realtime?: boolean;
  /** The app has OAuth credentials — i.e. connecting is even possible. */
  configured: boolean;
  /** A workspace is connected AND a channel is chosen. */
  connected: boolean;
  workspaces: WorkspaceSummary[];
  active: string | null;
}

export interface Thread {
  messages: Message[];
  members: Record<string, Member>;
  source: ChatSource;
  team?: string;
  channel?: string;
  channelId?: string;
  channelKind?: string;
}

const seeded: Thread = { messages: SEED, members: MEMBERS, source: 'seed' };
const OFFLINE: SlackStatus = { configured: false, connected: false, workspaces: [], active: null };

export async function slackStatus(): Promise<SlackStatus> {
  try {
    const res = await fetch('/api/slack/status');
    if (!res.ok) return OFFLINE;
    return (await res.json()) as SlackStatus;
  } catch {
    return OFFLINE;
  }
}

export async function loadThread(): Promise<Thread> {
  try {
    const res = await fetch('/api/slack/messages');
    if (!res.ok) return seeded;
    const d = (await res.json()) as {
      messages?: Message[]; members?: Record<string, Member>;
      team?: string; channel?: string; channelId?: string; channelKind?: string;
    };
    /* An empty channel is a real state, but rendering nothing is
       indistinguishable from a failure. Keep the seed until there is something
       real to show. */
    if (!d.messages?.length) return seeded;
    /* Seed first, then the live channel.
       The scripted thread is not fake next to real data — the whole account is
       invented, and $160,780 of spend is exactly as made up as Amara's message.
       What it is, is written: it shows what the panel is for in four messages,
       which a real channel reading "this is a test" does not. It stays as
       history above the live conversation. */
    return {
      /* Rebuild any shared metric card from the link in the message text. */
      messages: [...SEED, ...d.messages.map((m) => {
        const found = decodeView(m.body);
        const base = found ? { ...m, body: found.text, view: found.view } : m;
        /* Anything not marked fromSlack was posted by this app, which means
           Maya wrote it — Slack just recorded the bot as the author because
           the bot holds the token. Attributing it to the app's own identity is
           the truth of who typed it. Slack's own record still says Growth;
           changing that needs chat:write.customize and a reinstall. */
        return base.fromSlack ? base : { ...base, authorId: ME.id };
      })],
      members: { ...MEMBERS, ...(d.members ?? {}) },
      source: 'slack',
      team: d.team,
      channel: d.channel,
      channelId: d.channelId,
      channelKind: d.channelKind,
    };
  } catch {
    return seeded;
  }
}

export interface SlackChannel { id: string; name: string; joined: boolean }

export async function listChannels(): Promise<SlackChannel[]> {
  try {
    const res = await fetch('/api/slack/channels');
    if (!res.ok) return [];
    const { channels } = (await res.json()) as { channels?: SlackChannel[] };
    return channels ?? [];
  } catch {
    return [];
  }
}

export async function chooseChannel(channelId: string, channelName: string): Promise<boolean> {
  try {
    const res = await fetch('/api/slack/channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, channelName }),
    });
    return res.ok;
  } catch { return false; }
}

export async function switchWorkspace(teamId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/slack/active', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId }),
    });
    return res.ok;
  } catch { return false; }
}

export async function disconnect(teamId: string): Promise<boolean> {
  try {
    const res = await fetch('/api/slack/disconnect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId }),
    });
    return res.ok;
  } catch { return false; }
}

/** Returns false if it did not land, so the UI can say so rather than showing a
    message that only exists in this browser. */
export async function postToSlack(text: string, view?: ViewRef | null): Promise<boolean> {
  /* The view rides along as a link, so it comes back as a card on the next
     read instead of being flattened into prose. */
  const link = view ? encodeView(view, window.location.origin) : null;
  const body = link ? `${text} ${link}`.trim() : text;
  try {
    const res = await fetch('/api/slack/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      /* The link still rides in the text so the card can be rebuilt when this
         is read back into Growth. The view and link are sent alongside so
         Slack can render it as a real card rather than a bare URL. */
      body: JSON.stringify({ text: body, view, link }),
    });
    return res.ok;
  } catch { return false; }
}

/** Full page redirect — Slack's consent screen cannot run in an iframe. */
export function startInstall() {
  window.location.href = '/api/slack/install';
}


/**
 * Live updates, pushed rather than polled.
 *
 * Returns an unsubscribe function. The caller keeps polling as a fallback:
 * an SSE connection can be up and still miss an event — a dropped Slack
 * delivery, a proxy that buffers, a reconnect gap — and a chat that is silently
 * stale is worse than one that is a few seconds behind.
 */
export function subscribeToSlack(onChange: () => void): () => void {
  let es: EventSource | null = null;
  try {
    es = new EventSource('/api/slack/stream');
    es.addEventListener('message', () => onChange());
  } catch {
    return () => {};
  }
  return () => es?.close();
}
