import type { Member } from './chat';

/** A conversation the bot can see: a channel, a private channel, a group DM, or a DM. */
export interface Conversation {
  id: string;
  kind: 'channel' | 'private' | 'group' | 'dm';
  name: string;
  /** Present on DMs — the person on the other end. */
  userId?: string;
  avatar?: string;
  joined: boolean;
}

/** Someone in the workspace, for starting a DM and for @-mentions. */
export interface Person extends Member {
  /** Slack user id. Same as `id` for Slack people; absent for the seeded cast. */
  slackId?: string;
}

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(path);
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export async function listConversations(): Promise<Conversation[]> {
  return (await get<{ conversations?: Conversation[] }>('/api/slack/conversations', {})).conversations ?? [];
}

export async function listPeople(): Promise<Person[]> {
  const { people } = await get<{ people?: Person[] }>('/api/slack/people', {});
  /* The Slack id IS the id here, but naming it explicitly keeps the two
     directories distinguishable once local people are mixed in. */
  return (people ?? []).map((p) => ({ ...p, slackId: p.id }));
}

export async function openConversation(c: Conversation): Promise<boolean> {
  const res = await post('/api/slack/channel', { channelId: c.id, channelName: c.name, kind: c.kind });
  return Boolean(res?.ok);
}

/** Opens (or reopens) a DM. Idempotent in Slack: the same people, the same conversation. */
export async function startDm(userIds: string[], name: string): Promise<boolean> {
  const res = await post('/api/slack/dm', { userIds });
  if (!res?.ok) return false;
  const { id } = (await res.json()) as { id?: string };
  if (!id) return false;
  const kind = userIds.length > 1 ? 'group' : 'dm';
  return Boolean((await post('/api/slack/channel', { channelId: id, channelName: name, kind }))?.ok);
}

/**
 * Disconnect your own Slack account.
 *
 * There is no matching `link` — a link is only ever created by completing
 * Slack's consent screen. Asserting "that account is Dan" from a dropdown
 * would let one person put words in another's mouth.
 */
export async function unlinkAccount(personId: string): Promise<boolean> {
  return Boolean((await post('/api/slack/unlink', { personId }))?.ok);
}

/** Sends the browser to Slack to authorise, tagged with who is connecting. */
export function connectAs(personId: string) {
  window.location.href = `/api/slack/install?person=${encodeURIComponent(personId)}`;
}
