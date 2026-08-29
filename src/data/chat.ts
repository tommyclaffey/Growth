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

/**
 * The signed-in person.
 *
 * One definition, used by the sidebar account row and by every message sent
 * from this app. It was `name: 'You'` with initials from nobody — which reads
 * fine in a chat bubble and reads as a placeholder everywhere else. A product
 * that shows a cast of named colleagues and then calls the user "You" has one
 * seat at the table that is not a person.
 */
export const ME: Member = { id: 'maya', name: 'Maya Okonkwo', initials: 'MO', hue: 0 };

/** What the account row shows under her name. */
export const ME_ROLE = 'Growth lead';

export const MEMBERS: Record<string, Member> = {
  maya: ME,
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
  /** Absolute clock time, matching the design ("9:42 AM"). */
  time: string;
  /** Relayed in from Slack. The design carries a badge for exactly this. */
  fromSlack?: boolean;
  /** Ordering key only — never rendered. */
  minutesAgo: number;
  view?: ViewRef;
}

export const SEED: Message[] = [
  { id: 'm1', authorId: 'jr', minutesAgo: 214, time: '8:12 AM',
    body: 'Meta CAC is up 42% week over week. Worth a look before Friday.' },
  { id: 'm2', authorId: 'jr', minutesAgo: 212, time: '8:14 AM',
    body: 'Pulled the campaign split — most of it is Advantage+ Shopping.',
    view: { channel: 'meta', metric: 'CAC', range: 30 } },
  { id: 'm3', authorId: 'dk', minutesAgo: 156, time: '9:10 AM', fromSlack: true,
    body: 'That tracks. We raised the Advantage+ budget on the 14th and never re-baselined the target.' },
  { id: 'm4', authorId: 'ap', minutesAgo: 88, time: '10:38 AM',
    body: 'Affiliates are quietly carrying the quarter. 5.2x and the cheapest leads we have.',
    view: { channel: 'affiliates', metric: 'ROAS', range: 30 } },
  { id: 'm5', authorId: 'dk', minutesAgo: 41, time: '11:25 AM', fromSlack: true,
    body: 'Proposal: move 15% of Meta prospecting into Affiliates for two weeks and measure.' },
  { id: 'm6', authorId: 'jr', minutesAgo: 12, time: '11:54 AM',
    body: 'Works for me. Can someone pull the numbers into the Monday report?' },
];

/** Clock time for a message being sent right now. */
export function nowLabel(): string {
  return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

/**
 * A view, encoded so it survives a round trip through Slack.
 *
 * A shared metric is a Growth object; Slack only carries text. Posting the
 * card as prose loses it — the message arrives in Slack readable but comes
 * back as a sentence, and the unfurl is gone. So the reference is written as a
 * link and read back out of one.
 *
 * A link rather than a marker like `[growth:meta/CAC/30]` for two reasons: it
 * reads as something a person would send in Slack, and it is clickable, so a
 * teammate who is not looking at Growth still lands on the right screen.
 */
export function encodeView(view: ViewRef, origin: string): string {
  const q = new URLSearchParams({ c: view.channel, m: view.metric, r: String(view.range) });
  return `${origin}/Growth/?${q}`;
}

const VIEW_RE = /https?:\/\/[^\s]*\/Growth\/\?(?:[^\s]*&)?c=([a-zA-Z]+)&m=([A-Za-z]+)&r=(7|30|90)/;

/** Pulls a view back out of message text. Returns null when there isn't one. */
export function decodeView(text: string): { view: ViewRef; text: string } | null {
  const m = text.match(VIEW_RE);
  if (!m) return null;
  const [full, channel, metric, range] = m;
  /* Strip the URL from the body — the card renders it, and leaving the raw
     link in as well shows the same thing twice. */
  return {
    view: { channel: channel as ViewRef['channel'], metric: metric as Metric, range: Number(range) as Range },
    text: text.replace(full, '').replace(/\s{2,}/g, ' ').trim(),
  };
}
