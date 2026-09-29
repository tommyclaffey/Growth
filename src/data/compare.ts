import { CAMPAIGNS, type Campaign } from './campaigns';
import { campaignDelta, campaignTotals } from './campaignSeries';
import { CHANNEL_METRICS, betterHigher, formatDerived, valueOf, type DerivedMetric } from './channelMetrics';
import type { Range } from './metrics';

/**
 * Two campaigns, side by side, on the same range.
 *
 * ⭐ "Is this campaign good?" is only answerable against something. The KPI
 * cards compare a campaign with its channel's average; this compares it with
 * ONE other campaign the reader chooses -- the question a buyer actually asks
 * when deciding where the next dollar goes.
 *
 * Rules the rows keep:
 *  - A metric a channel cannot report is a dash, never 0 (a podcast has no CTR).
 *  - Only EFFICIENCY metrics get a winner. More spend or more leads is size,
 *    not quality; crowning the bigger campaign would reward the budget.
 *  - Across two channels the rows carry a caveat: cost comparisons between
 *    channels are last-touch, not like for like.
 */

export const COMPARE_METRICS: DerivedMetric[] = ['Spend', 'Leads', 'CAC', 'ROAS', 'CTR', 'CVR', 'CPC'];
const EFFICIENCY = new Set<DerivedMetric>(['CAC', 'ROAS', 'CTR', 'CVR', 'CPC']);

export interface CompareRow {
  metric: DerivedMetric;
  a?: string;
  b?: string;
  /** 'a' | 'b' when one is better on an efficiency metric; undefined otherwise. */
  winner?: 'a' | 'b';
}

export interface Comparison {
  a: Campaign;
  b: Campaign;
  rows: CompareRow[];
  crossChannel: boolean;
  /** Week-over-week CAC change of each, so a winner that is slipping says so. */
  cacTrend: { a: number; b: number };
}

export function compareCampaigns(aId: string, bId: string, range: Range): Comparison | undefined {
  const a = CAMPAIGNS.find((c) => c.id === aId);
  const b = CAMPAIGNS.find((c) => c.id === bId);
  if (!a || !b) return undefined;
  const ta = campaignTotals(a.id, range);
  const tb = campaignTotals(b.id, range);
  const rows = COMPARE_METRICS.map((m): CompareRow => {
    const has = (c: Campaign) => m === 'Spend' || m === 'Leads' || CHANNEL_METRICS[c.channel].includes(m);
    const va = has(a) ? valueOf(m, ta) : undefined;
    const vb = has(b) ? valueOf(m, tb) : undefined;
    let winner: CompareRow['winner'];
    /* 🐛 Decided on what the reader SEES. 4.6x against 4.6x got a tick from a
       difference in the third decimal -- a winner nobody could verify from the
       screen. Equal as displayed is a tie. */
    const shownEqual = va !== undefined && vb !== undefined && formatDerived(m, va) === formatDerived(m, vb);
    if (EFFICIENCY.has(m) && va !== undefined && vb !== undefined && va > 0 && vb > 0 && !shownEqual) {
      winner = (betterHigher(m) ? va > vb : va < vb) ? 'a' : 'b';
    }
    return {
      metric: m,
      a: va === undefined ? undefined : formatDerived(m, va),
      b: vb === undefined ? undefined : formatDerived(m, vb),
      winner,
    };
  });
  return {
    a, b, rows,
    crossChannel: a.channel !== b.channel,
    cacTrend: { a: campaignDelta(a.id, 'CAC', 7), b: campaignDelta(b.id, 'CAC', 7) },
  };
}
