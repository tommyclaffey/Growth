import { isRatio, type Metric } from '../../data/metrics';

/** Above this many points a bar becomes a picket fence. 1172px / 45 ≈ 26px. */
export const BAR_LIMIT = 45;

export type Mark = 'bar' | 'line' | 'auto';

/**
 * Which mark to draw.
 *
 *   Ratios always use a line. CAC and ROAS do not accumulate, and a bar
 *   encodes magnitude as length from zero — it invites the eye to read total
 *   area as a quantity that does not exist.
 *
 *   Above 45 points everything uses a line, because a 13px bar carries no
 *   more information than the line through its top edge and carries it worse.
 *
 *   Otherwise quantities use bars.
 *
 * Lives in its own module, with no CSS import, so it can be tested directly.
 * The rule is the part worth testing; the rendering is not.
 */
export function resolveMark(
  metric: Metric,
  points: number,
  requested: Mark = 'auto',
): 'bar' | 'line' {
  if (requested !== 'auto') return requested;
  if (isRatio(metric)) return 'line';
  if (points > BAR_LIMIT) return 'line';
  return 'bar';
}
