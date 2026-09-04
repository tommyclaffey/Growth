import { ME, MEMBERS, SEED, type Member, type Message } from './chat';

/**
 * Conversations, as objects this app owns.
 *
 * The previous model had no conversations in it. `loadThread()` returned one
 * thread — whichever Slack channel was linked — so "message someone directly"
 * could only mean "ask Slack to open a DM", and with Slack disconnected there
 * was nothing to organise at all. The picker could create a DM it then had
 * nowhere to put.
 *
 * So the direction is inverted: Growth holds the conversations, and Slack
 * mirrors ONE of them. That is also the honest model — a DM between two people
 * in this product is not a Slack DM, and pretending otherwise is how you end
 * up with two sources for one thread.
 *
 * Kinds exist because they change behaviour, not because they look different:
 *
 *   channel  a named room. Name is stored; membership can change under it.
 *   dm       exactly one other person. Name is DERIVED, never stored — a
 *            renamed teammate must not leave a stale name in a list.
 *   group    two or more others. Same derivation, truncated.
 */

export type ConversationKind = 'channel' | 'dm' | 'group';

export interface Conversation {
  id: string;
  kind: ConversationKind;
  /**
   * A name someone chose. Optional everywhere, because most conversations do
   * not need one — a DM with Dan is "Dan Kwon" and naming it adds nothing.
   * When it IS set it wins, including on a DM, because a name someone typed
   * is a stronger signal than a name derived from membership.
   */
  title?: string;
  /** Everyone in it, including me — so a group of 3 has 3 ids, not 2. */
  memberIds: string[];
  messages: Message[];
  /**
   * How many messages had been seen when this was last opened. Stored as a
   * count rather than a timestamp because the seed data has no real clock —
   * `minutesAgo` is an ordering key, and deriving unread from it would make
   * every conversation unread again on every reload.
   */
  readCount: number;
  /** The one conversation Slack mirrors, when a channel is linked. */
  mirrorsSlack?: boolean;
}

const KEY = 'growth.conversations';

/* ---------------------------------------------------------------- seeds -- */

function msg(authorId: string, minutesAgo: number, time: string, body: string, fromSlack = false): Message {
  return { id: `${authorId}-${minutesAgo}`, authorId, minutesAgo, time, body, ...(fromSlack ? { fromSlack } : {}) };
}

/* Seeded so the list is a list on first run. An empty inbox teaches nothing
   about how the product works, and this account is a demo end to end. */
function seeds(): Conversation[] {
  return [
    {
      id: 'team',
      kind: 'channel',
      title: 'growth-analytics',
      memberIds: ['maya', 'jr', 'dk', 'ap'],
      messages: SEED,
      readCount: SEED.length,
      mirrorsSlack: true,
    },
    {
      id: 'dm-jr',
      kind: 'dm',
      memberIds: ['maya', 'jr'],
      messages: [
        msg('jr', 63, '11:03 AM', 'Do you want the Monday report split by channel or blended?'),
        msg('maya', 61, '11:05 AM', 'Split. Blended hides the Affiliates story.'),
        msg('jr', 26, '11:40 AM', 'Makes sense. I will have a draft by 4.'),
      ],
      readCount: 3,
    },
    {
      id: 'dm-dk',
      kind: 'dm',
      memberIds: ['maya', 'dk'],
      messages: [
        msg('dk', 34, '11:32 AM', 'Re-baselined the Advantage+ target. CAC should settle by Thursday.', true),
        msg('dk', 33, '11:33 AM', 'Flagging early in case Friday looks worse before it looks better.', true),
      ],
      /* One unread, deliberately — the list needs to show what unread looks
         like, and every conversation being read makes the affordance dead. */
      readCount: 1,
    },
    {
      id: 'grp-budget',
      kind: 'group',
      memberIds: ['maya', 'dk', 'ap'],
      messages: [
        msg('ap', 96, '10:30 AM', 'Starting a thread for the reallocation so it does not get lost in the main channel.'),
        msg('dk', 94, '10:32 AM', 'Good call. 15% of Meta prospecting, two weeks, then we measure.'),
        msg('ap', 18, '11:48 AM', 'I can pull the before numbers this afternoon.'),
      ],
      readCount: 3,
    },
  ];
}

/* ---------------------------------------------------------- persistence -- */

let cache: Conversation[] | null = null;

/** A record is usable if we can read its messages. Nothing else is load-bearing. */
function usable(c: unknown): c is Conversation {
  return Boolean(c) && Array.isArray((c as Conversation).messages)
    && typeof (c as Conversation).id === 'string';
}

/**
 * Read the store WITHOUT ever destroying what is in it.
 *
 * This used to validate all-or-nothing and then call save() on the failure
 * path: one malformed record meant every real conversation was replaced by
 * the four demo seeds AND written over, so the original was unrecoverable.
 * A read that can delete your data is not a read. It is also the worst
 * possible failure mode for the one thing in here the user actually created
 * rather than received.
 *
 * Now: keep every record that parses, drop only the ones that do not, and add
 * seeds by id-union so the demo threads come back without clobbering anything
 * that shares the list with them. Nothing is written unless the result
 * actually differs from what was stored.
 */
export function allConversations(): Conversation[] {
  if (cache) return cache;

  let stored: Conversation[] = [];
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) stored = parsed.filter(usable);
    }
  } catch {
    /* Private mode, quota, corrupt JSON. Keep the raw copy rather than
       overwriting it -- if it is recoverable, it is recoverable from here and
       nowhere else. */
    if (raw) { try { localStorage.setItem(`${KEY}.unreadable`, raw); } catch { /* nothing left to try */ } }
  }

  /* Seeds fill gaps; they never replace. A stored record wins on id collision
     because it has the user's messages in it and the seed does not. */
  const byId = new Map<string, Conversation>();
  for (const c of seeds()) byId.set(c.id, c);
  for (const c of stored) byId.set(c.id, c);

  cache = [...byId.values()];
  /* Only write when the merge actually changed something, so a normal read
     stays a read. */
  if (stored.length !== cache.length) save();
  return cache;
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache ?? [])); } catch { /* not fatal */ }
}

export function getConversation(id: string): Conversation | undefined {
  return allConversations().find((c) => c.id === id);
}

/* -------------------------------------------------------------- naming -- */

/**
 * ONE directory, so a person looks the same everywhere.
 *
 * There were two. The conversation list resolved people through the static
 * MEMBERS map, while the open thread resolved them through the merged
 * Slack-aware map held in ChatPanel state — so the same colleague rendered as
 * coloured initials in the list and as their real Slack photo one click later.
 * Nothing was broken; the two surfaces just disagreed about where a person's
 * picture comes from.
 *
 * The overlay is set once, when a Slack thread loads, and every caller reads
 * through here. A second lookup path is what produced the bug, so there is
 * exactly one.
 */
let overlay: Record<string, Member> = {};

export function setMemberOverlay(next: Record<string, Member>) {
  overlay = next;
}

export function memberOf(id: string): Member {
  return overlay[id] ?? MEMBERS[id]
    ?? { id, name: id, initials: id.slice(0, 2).toUpperCase(), hue: 0 };
}

/** Everyone we know about — Growth's own people plus anyone Slack added. */
export function directory(): Member[] {
  const seen = new Map<string, Member>();
  for (const m of Object.values(MEMBERS)) seen.set(m.id, m);
  for (const m of Object.values(overlay)) seen.set(m.id, m);
  return [...seen.values()];
}

/** Everyone except me — the people a DM or group is actually *with*. */
export function others(c: Conversation): Member[] {
  return c.memberIds.filter((id) => id !== ME.id).map(memberOf);
}

/**
 * A chosen name if there is one, otherwise derived from membership.
 *
 * Derivation is the default rather than the fallback, because a stored DM name
 * goes stale the moment someone is renamed — the old picker stored exactly
 * that, `selected.map(p => p.name).join(', ')` frozen at creation time. A name
 * a person typed does not have that problem: it was never a description of
 * membership in the first place.
 */
export function conversationName(c: Conversation): string {
  if (c.kind === 'channel') return `#${c.title ?? 'channel'}`;
  if (c.title) return c.title;
  const people = others(c);
  if (people.length === 0) return 'Just you';
  if (people.length === 1) return people[0].name;
  if (people.length === 2) return people.map((p) => p.name.split(' ')[0]).join(' & ');
  const first = people.slice(0, 2).map((p) => p.name.split(' ')[0]).join(', ');
  return `${first} +${people.length - 2}`;
}

export function unreadCount(c: Conversation): number {
  return Math.max(0, c.messages.length - c.readCount);
}

export function lastMessage(c: Conversation): Message | undefined {
  return c.messages[c.messages.length - 1];
}

/**
 * Most recent first. `minutesAgo` counts backwards, so the smallest value is
 * the newest — sorting it ascending is what puts the live conversation on top.
 */
export function sortedConversations(): Conversation[] {
  return [...allConversations()].sort((a, b) => {
    const am = lastMessage(a)?.minutesAgo ?? Number.MAX_SAFE_INTEGER;
    const bm = lastMessage(b)?.minutesAgo ?? Number.MAX_SAFE_INTEGER;
    return am - bm;
  });
}

/* ------------------------------------------------------------- mutation -- */

function mutate(id: string, fn: (c: Conversation) => void) {
  const list = allConversations();
  const c = list.find((x) => x.id === id);
  if (!c) return;
  fn(c);
  save();
}

/**
 * Naming a conversation.
 *
 * An empty name clears it rather than storing "", so a cleared name falls back
 * to derivation instead of rendering a blank header.
 */
export function renameConversation(id: string, title: string) {
  const next = title.trim();
  mutate(id, (c) => {
    if (next) c.title = next;
    else if (c.kind !== 'channel') delete c.title;
  });
}

export function markRead(id: string) {
  mutate(id, (c) => { c.readCount = c.messages.length; });
}

export function appendMessage(id: string, message: Message) {
  mutate(id, (c) => {
    c.messages = [...c.messages, message];
    c.readCount = c.messages.length;
  });
}

/** Replaces a mirrored conversation's messages with what Slack actually holds. */
export function replaceMessages(id: string, messages: Message[]) {
  mutate(id, (c) => {
    /* readCount is carried across unchanged, so anything the new list adds is
       unread by construction.

       It used to be recomputed as (newLength - previousUnread), which PINNED
       unread to whatever it already was: a conversation sitting at zero stayed
       at zero no matter how many messages Slack delivered. Every inbound
       message was silently marked as already read, which is the one thing an
       unread count exists to prevent.

       Clamped only so a shorter list -- an edit, a deletion, a narrower
       history window -- cannot leave readCount pointing past the end. */
    /* MERGE, not overwrite.

       Slack is the authority for what Slack holds -- it is not the authority
       for messages it never received. Overwriting wholesale deleted exactly
       those: send a DM that fails, watch the banner say "saved here", and three
       seconds later the sync replaced the array with Slack's copy and the
       message was gone, including from localStorage on the next save.

       So anything still `pending` survives, unless the incoming list contains
       it -- which is how a message that DID arrive stops being pending instead
       of rendering twice. Matched on author and body rather than id, because
       Slack assigns its own id and the local one never appears in its history. */
    const echoed = (m: Message) => messages.some(
      (s) => s.authorId === m.authorId && s.body.trim() === m.body.trim(),
    );
    const unsent = c.messages.filter((m) => m.pending && !echoed(m));

    c.messages = [...messages, ...unsent];
    c.readCount = Math.min(c.readCount, c.messages.length);
  });
}

/**
 * One entry point for both, because the choice a person is making is the same
 * one — pick who, then talk. Slack models `im` and `mpim` as different
 * conversation types; that is Slack's problem, not the user's.
 *
 * Returns an existing conversation when the same set of people already has
 * one. Two threads with identical membership is the bug that makes people ask
 * "which Dan chat did I send that in".
 */
export function openDirect(memberIds: string[]): Conversation {
  const ids = Array.from(new Set([ME.id, ...memberIds]));
  const key = [...ids].sort().join('|');
  const existing = allConversations().find(
    (c) => c.kind !== 'channel' && [...c.memberIds].sort().join('|') === key,
  );
  if (existing) return existing;

  const created: Conversation = {
    id: `c-${key.replace(/\|/g, '-')}`,
    kind: ids.length > 2 ? 'group' : 'dm',
    memberIds: ids,
    messages: [],
    readCount: 0,
  };
  cache = [created, ...allConversations()];
  save();
  return created;
}

/** Test seam and a way out of a bad stored state. */
export function resetConversations() {
  cache = seeds();
  save();
}
