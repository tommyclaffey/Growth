import { bucketsOf } from './buckets';
import { reportable, valueOf, type DerivedMetric } from './channelMetrics';
import { DAY_ISO, hasWindow, rowsFor, sliceWindow, type DayRow, type Range, type Scope } from './metrics';

/**
 * A metric period by period -- the table's Week / Month view, as data.
 *
 * ONE definition, read by the table's columns, the local answerer ("how is Meta
 * CAC trending by week?") and the model's get_by_period tool, so the three
 * cannot disagree. Each period's value is taken from its SUMMED funnel (a ratio
 * is never an average of daily ratios), and a change is only stated between
 * two WHOLE periods -- a 3-day week is a smaller number, not a worse week.
 */

export interface TrendPoint {
  label: string;
  days: number;
  full: boolean;
  /** Null when the period cannot report the metric (a CAC with no leads). */
  value: number | null;
  /** % against the period before -- null when either is partial or unreportable. */
  change: number | null;
}

export interface Trend {
  by: 'week' | 'month';
  points: TrendPoint[];
  /** The span actually used (a request longer than the data is shortened). */
  days: number;
}

const add = (a: DayRow, r: DayRow): DayRow => ({
  spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks,
  leads: a.leads + r.leads, sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
});
const ZERO: DayRow = { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 };

export function trendBy(scope: Scope, metric: DerivedMetric, by: 'week' | 'month', days: Range): Trend {
  /* Never past the start of the data. */
  let span = Math.max(1, Math.min(days, 365));
  while (span > 1 && !hasWindow(span)) span -= 1;
  const rows = rowsFor(scope, span);
  const iso = sliceWindow(DAY_ISO, span);
  const points: TrendPoint[] = [];
  for (const b of bucketsOf(iso, by)) {
    const sum = rows.slice(b.start, b.end).reduce(add, ZERO);
    const value = reportable(metric, sum) ? valueOf(metric, sum) : null;
    const prev = points[points.length - 1];
    const change = prev && prev.full && b.full && value !== null && prev.value !== null && prev.value !== 0
      ? Math.round(((value - prev.value) / Math.abs(prev.value)) * 100)
      : null;
    points.push({ label: b.label, days: b.days, full: b.full, value, change });
  }
  return { by, points, days: span };
}
