import type { Member } from './chat';

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

export async function listPeople(): Promise<Person[]> {
  const { people } = await get<{ people?: Person[] }>('/api/slack/people', {});
  /* The Slack id IS the id here, but naming it explicitly keeps the two
     directories distinguishable once local people are mixed in. */
  return (people ?? []).map((p) => ({ ...p, slackId: p.id }));
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
