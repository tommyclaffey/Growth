import type { ChannelName } from '../styles/tokens';
import type { Metric, Range } from './metrics';

export interface Member {
  id: string;
  name: string;
  initials: string;
  /* A stable hue index so a person is the same colour in every message.
     Colour follows the entity, never its position in the list. */
  hue: 0 | 1 | 2 | 3;
}

export const ME: Member = { id: 'tc', name: 'You', initials: 'TC', hue: 0 };

export const MEMBERS: Record<string, Member> = {
  tc: ME,
  jr: { id: 'jr', name: 'Jess Ramírez', initials: 'JR', hue: 1 },
  dk: { id: 'dk', name: 'Dan Kwon',     initials: 'DK', hue: 2 },
  ap: { id: 'ap', name: 'Amara Price',  initials: 'AP', hue: 3 },
};

/** A view someone shared, unfurled inline like a link preview. */
export interface ViewRef {
  channel: ChannelName | 'all';
  metric: Metric;
  range: Range;
}

export interface Message {
  id: string;
  authorId: string;
  body: string;
  /** Minutes before now, so the seed never shows a stale absolute time. */
  minutesAgo: number;
  view?: ViewRef;
}

export const SEED: Message[] = [
  { id: 'm1', authorId: 'jr', minutesAgo: 214,
    body: 'Meta CAC is up 42% week over week. Worth a look before Friday.' },
  { id: 'm2', authorId: 'jr', minutesAgo: 212,
    body: 'Pulled the campaign split — most of it is Advantage+ Shopping.',
    view: { channel: 'meta', metric: 'CAC', range: 30 } },
  { id: 'm3', authorId: 'dk', minutesAgo: 156,
    body: 'That tracks. We raised the Advantage+ budget on the 14th and never re-baselined the target.' },
  { id: 'm4', authorId: 'ap', minutesAgo: 88,
    body: 'Affiliates are quietly carrying the quarter. 5.2x and the cheapest leads we have.',
    view: { channel: 'affiliates', metric: 'ROAS', range: 30 } },
  { id: 'm5', authorId: 'dk', minutesAgo: 41,
    body: 'Proposal: move 15% of Meta prospecting into Affiliates for two weeks and measure.' },
  { id: 'm6', authorId: 'jr', minutesAgo: 12,
    body: 'Works for me. Can someone pull the numbers into the Monday report?' },
];

/** "just now", "12m", "3h", "2d" — relative, so it never needs a real clock. */
export function relativeTime(minutesAgo: number): string {
  if (minutesAgo < 1) return 'just now';
  if (minutesAgo < 60) return `${Math.round(minutesAgo)}m`;
  if (minutesAgo < 60 * 24) return `${Math.round(minutesAgo / 60)}h`;
  return `${Math.round(minutesAgo / (60 * 24))}d`;
}

/**
 * Consecutive messages from one person collapse into a single block.
 * Repeating the avatar and name on every line is what makes a chat feel like
 * a log instead of a conversation.
 */
export function groupMessages(messages: Message[]): Message[][] {
  const groups: Message[][] = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    const sameAuthor = last && last[0].authorId === m.authorId;
    const closeInTime = last && Math.abs(last[last.length - 1].minutesAgo - m.minutesAgo) < 10;
    if (sameAuthor && closeInTime) last.push(m);
    else groups.push([m]);
  }
  return groups;
}
