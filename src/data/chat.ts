import mayaPhoto from '../assets/maya.jpg';
import type { ChannelName } from '../styles/tokens';
import { DERIVED_METRICS, type DerivedMetric } from './channelMetrics';
import { CAMPAIGNS } from './campaigns';
import type { Range } from './metrics';
import { CHANNEL_KEYS, RANGES } from './metrics';

export interface Member {
  id: string;
  name: string;
  initials: string;
  /** Optional — most colleagues have none, and initials are the norm. */
  avatar?: string;
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
export const ME: Member = { id: 'maya', name: 'Maya Okonkwo', initials: 'MO', hue: 0, avatar: mayaPhoto };

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
  /**
   * Widened from `Metric` to `DerivedMetric` so a campaign card can be shared.
   * A campaign reports CTR, CPM and CPC; the six funnel metrics cannot express
   * those, and sharing "CTR" as "Clicks" would put a number in the thread that
   * is not the number the sender clicked.
   *
   * ⚠️ Consequence: a ViewRef's metric is NOT always something the app-wide
   * metric toggle can accept. Anything applying one has to narrow first.
   */
  metric: DerivedMetric;
  range: Range;
  /**
   * Present when the shared card came from a campaign page. The channel stays
   * populated either way -- it is what the card's mark and colour come from.
   */
  campaign?: string;
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
  /**
   * Written here, not yet confirmed by Slack.
   *
   * Exists so a sync can tell a message Slack has never seen apart from one it
   * has. Without the distinction, the only safe merge is no merge, and the
   * only cheap one is a full overwrite -- which is how a message that failed to
   * send got deleted three seconds after the UI promised it was saved.
   */
  pending?: boolean;
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
    /* Measured against the group's FIRST message, not its last.
       Comparing to the previous message let small gaps chain: 39 -> 37 -> 28
       -> 27 -> 19 -> 11 minutes ago is eleven steps of under ten minutes and
       one group spanning twenty-eight. The header renders group[0].time, so a
       message sent at 11:05 was labelled 10:38.
       Anchoring to the first message caps the whole group at the window,
       which is the only version where the timestamp shown is true for every
       message under it. */
    const closeInTime = last && Math.abs(last[0].minutesAgo - m.minutesAgo) < 10;
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
export function encodeView(view: ViewRef, origin: string, conversationId?: string): string {
  const q = new URLSearchParams({ c: view.channel, m: view.metric, r: String(view.range) });
  /* The thread rides along so the link lands you in the CONVERSATION, not just
     on the screen. A number without the discussion around it is the least
     useful half -- you can already see the number; what you cannot see is what
     anyone said about it.

     Appended after r so the decode regex, which anchors on c/m/r in order, is
     unaffected by its presence or absence. */
  /* Before `t`, so the decode regex -- which anchors on c/m/r and then
     consumes the rest -- is unaffected either way. */
  if (view.campaign) q.set('p', view.campaign);
  if (conversationId) q.set('t', conversationId);
  return `${origin}/Growth/?${q}`;
}

export interface DeepLink {
  view: ViewRef;
  /** The conversation the link was shared in, when it carried one. */
  conversationId?: string;
}

/**
 * Read a shared link back out of a URL.
 *
 * This did not exist. Links were generated, posted to Slack, and then ignored
 * on arrival -- clicking one opened Growth on the default Overview and threw
 * the view away. The card rendered inside Growth because decodeView parses
 * message TEXT, which hid the fact that the clickable link itself did nothing.
 */
/* Validate against the real lists rather than casting and hoping.

   `range` was checked and the other two were blind casts, so ?c=xx WHITE-
   SCREENED the app: setChannel('xx') -> totals('xx') -> SERIES['xx'] is
   undefined -> undefined.slice() throws DURING RENDER, React unmounts the
   tree, and the isActive guard is an effect so it cannot run in time. ?m=Bogus
   was quieter and worse -- series() has no default branch, so every point came
   back undefined and the chart rendered "$NaN" with nothing thrown.

   A URL is untrusted input, and this one arrives from Slack, where anyone in
   the channel can type it. */
function asChannel(v: string | null): ViewRef['channel'] | null {
  if (v === 'all') return 'all';
  return (CHANNEL_KEYS as readonly string[]).includes(v ?? '') ? (v as ViewRef['channel']) : null;
}
function asMetric(v: string | null): DerivedMetric | null {
  /* Validated against the DERIVED list, not the six funnel metrics -- a shared
     campaign card can legitimately be a CTR or a CPM, and checking against the
     narrower list would have silently dropped those links on arrival. */
  return (DERIVED_METRICS as readonly string[]).includes(v ?? '') ? (v as DerivedMetric) : null;
}
function asCampaign(v: string | null): string | undefined {
  /* An id that no longer exists is not a campaign. Returning it anyway would
     navigate to the "that campaign no longer exists" screen from a link that
     could have shown the channel instead. */
  return v && CAMPAIGNS.some((c) => c.id === v) ? v : undefined;
}
function asRange(v: string | null): Range | null {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : null;
}

export function readDeepLink(search: string): DeepLink | null {
  const q = new URLSearchParams(search);
  const channel = asChannel(q.get('c'));
  const metric = asMetric(q.get('m'));
  const range = asRange(q.get('r'));
  if (!channel || !metric || !range) return null;
  const campaign = asCampaign(q.get('p'));
  return {
    view: { channel, metric, range, ...(campaign ? { campaign } : {}) },
    conversationId: q.get('t') ?? undefined,
  };
}

/* The trailing (?:&[^\s]*)? is load-bearing.

   Without it the pattern matched c/m/r and STOPPED, so when `&t=` was added to
   the link the match ended mid-URL: the view decoded fine, but replace() only
   removed the part it matched and the rest of the query stayed in the message
   body as "&t=c-U0BCFJ0CKQV-maya". I verified the regex still MATCHED and
   never verified it still consumed the whole URL -- a passing check on a
   partial assertion, again. */
const VIEW_RE = /https?:\/\/[^\s]*\/Growth\/\?(?:[^\s]*&)?c=([a-zA-Z]+)&m=([A-Za-z]+)&r=(7|30|90)(?:&[^\s]*)?/;

/** Pulls a view back out of message text. Returns null when there isn't one. */
export function decodeView(text: string): { view: ViewRef; text: string } | null {
  const m = text.match(VIEW_RE);
  if (!m) return null;
  const full = m[0];

  /* Parses the matched URL through readDeepLink rather than re-validating the
     regex's own capture groups.

     Those two paths used to be separate implementations of the same decision,
     and the old comment here literally read "same validation as readDeepLink"
     -- one rule written twice is one rule that drifts. It would have drifted
     immediately: the campaign parameter is not a capture group, so a campaign
     card shared into Slack would have come back as its channel, showing a
     number that belongs to six campaigns under a heading naming one. */
  const link = readDeepLink(full.slice(full.indexOf('?') + 1));
  if (!link) return null;

  /* Strip the URL from the body — the card renders it, and leaving the raw
     link in as well shows the same thing twice. */
  return {
    view: link.view,
    text: text.replace(full, '').replace(/\s{2,}/g, ' ').trim(),
  };
}
