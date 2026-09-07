import type { NavKey } from '../components/Sidebar/Sidebar';
import { CHANNEL_KEYS, METRICS, RANGES, type Metric, type Range } from './metrics';
import type { ChannelName } from '../styles/tokens';
import { CAMPAIGNS } from './campaigns';

/**
 * The screen you are looking at, expressed in the address bar.
 *
 * `readDeepLink` existed and was only ever read -- nothing wrote back -- so a
 * reload dropped you on Overview/Spend/30d no matter where you had been, the
 * back button left the app entirely, and copying the URL to a colleague sent
 * them somewhere other than what you were describing.
 *
 * Shares its parameter names with the Slack link format on purpose. A URL you
 * copy out of the address bar and a URL the app generated for Slack are the
 * same URL; two grammars for one address is how they drift.
 */
export interface UrlState {
  nav: NavKey;
  channel: ChannelName | null;
  metric: Metric;
  range: Range;
  campaign: string | null;
}

const NAV_KEYS: NavKey[] = ['overview', 'channels', 'campaigns', 'reports', 'notifications', 'settings'];

/* Every field validated against the real list. A URL is untrusted input --
   this one arrives from Slack, from a bookmark written by an older build, and
   from anyone who fancies editing the address bar. An unrecognised value falls
   back to the default rather than reaching the render as a bad key. */
export function readUrlState(search: string): Partial<UrlState> {
  const q = new URLSearchParams(search);
  const out: Partial<UrlState> = {};

  const v = q.get('v');
  if (v && (NAV_KEYS as string[]).includes(v)) out.nav = v as NavKey;

  const c = q.get('c');
  if (c === 'all') out.channel = null;
  else if (c && (CHANNEL_KEYS as readonly string[]).includes(c)) out.channel = c as ChannelName;

  const m = q.get('m');
  if (m && (METRICS as readonly string[]).includes(m)) out.metric = m as Metric;

  const r = Number(q.get('r'));
  if ((RANGES as readonly number[]).includes(r)) out.range = r as Range;

  const p = q.get('p');
  if (p && CAMPAIGNS.some((x) => x.id === p)) out.campaign = p;

  return out;
}

export function urlStateQuery(s: UrlState): string {
  const q = new URLSearchParams();
  q.set('v', s.nav);
  q.set('c', s.channel ?? 'all');
  q.set('m', s.metric);
  q.set('r', String(s.range));
  if (s.campaign) q.set('p', s.campaign);
  /* `t` -- the conversation a Slack link pointed at -- is deliberately never
     written. It is a one-shot instruction to open a thread, not a property of
     the screen; persisting it would reopen that conversation on every reload
     forever. Not writing it is also what consumes it. */
  return q.toString();
}

/**
 * `push` for navigation, `replace` for filters.
 *
 * Changing screen or drilling into a campaign is a place you can meaningfully
 * go BACK from. Nudging the metric toggle is not -- pushing an entry for every
 * filter change makes the back button a slow undo of things nobody wanted
 * undone, and buries the entry that would have left the dashboard.
 */
export function writeUrlState(s: UrlState, mode: 'push' | 'replace') {
  const url = `${window.location.pathname}?${urlStateQuery(s)}`;
  if (window.location.search === `?${urlStateQuery(s)}`) return;
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}
