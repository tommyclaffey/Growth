import { useMemo } from 'react';
import type { ChannelName } from '../styles/tokens';
import { decisions } from './decisions';
import { decisionEvents } from './decisionEvents';
import { notifications } from './notifications';
import { isFlagged, useFlags } from './attention';
import { isDismissed, useDismissals } from './dismissedDecisions';
import { usePrefs } from './prefs';
import { dataVersion, type Range } from './metrics';

/**
 * The sidebar's counts -- the SAME numbers the two screens show, from the same
 * functions, so a badge can never disagree with the page it opens.
 *
 *   Decisions     proposals still waiting on you: actionable (not the
 *                 questions), not taken, not dismissed
 *   Notifications unread, exactly as the Notifications screen counts it
 *
 * Memoised: the engine runs ~70ms on a large account, and the app re-renders
 * far more often than the data, the flags or the read state change.
 */
export function useNavCounts(range: Range, channels: ChannelName[]): { decisions: number; notifications: number } {
  const flags = useFlags();
  const dismissed = useDismissals();
  const { readAlerts } = usePrefs();
  const version = dataVersion();
  const waiting = useMemo(
    () => decisions(range, channels)
      .filter((c) => c.tier !== 3 && !isFlagged('decision', c.id) && !isDismissed(c.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version/flags/dismissed are the cache keys
    [range, channels, version, flags, dismissed],
  );
  const read = new Set(readAlerts);
  const unread = [...decisionEvents(), ...notifications(channels)].filter((n) => !read.has(n.id)).length;
  return { decisions: waiting, notifications: unread };
}
