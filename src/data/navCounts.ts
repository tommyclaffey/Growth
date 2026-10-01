import type { ChannelName } from '../styles/tokens';
import { decisions } from './decisions';
import { decisionEvents } from './decisionEvents';
import { notifications } from './notifications';
import { isFlagged, useFlags } from './attention';
import { isDismissed, useDismissals } from './dismissedDecisions';
import { usePrefs } from './prefs';
import type { Range } from './metrics';
import { useCampaignStatus } from './campaignStatus';

/**
 * The sidebar's counts -- the SAME numbers the two screens show, from the same
 * functions, so a badge can never disagree with the page it opens.
 *
 *   Decisions     proposals still waiting on you: actionable (not the
 *                 questions), not taken, not dismissed
 *   Notifications unread, exactly as the Notifications screen counts it
 *
 * 🐛 Not memoised here any more. This memo keyed on range, channels, data
 * version, flags and dismissals -- but the engine also reads campaign stages,
 * budgets, the news threshold and the date window. Approving a campaign
 * changed the Decisions screen and left the badge on the old number. The
 * engine caches itself on EVERY input (decisionCache.test.ts), so a repeat
 * call is free; this subscribes to stage changes so it re-renders on them.
 */
export function useNavCounts(range: Range, channels: ChannelName[]): { decisions: number; notifications: number } {
  const flags = useFlags();
  const dismissed = useDismissals();
  const { readAlerts } = usePrefs();
  useCampaignStatus();
  void flags; void dismissed;
  const waiting = decisions(range, channels)
    .filter((c) => c.tier !== 3 && !isFlagged('decision', c.id) && !isDismissed(c.id)).length;
  const read = new Set(readAlerts);
  const unread = [...decisionEvents(), ...notifications(channels)].filter((n) => !read.has(n.id)).length;
  return { decisions: waiting, notifications: unread };
}
