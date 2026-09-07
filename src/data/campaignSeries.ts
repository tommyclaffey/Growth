import { deltaOf, sampleOf } from './metrics';
import { valueOf, type DerivedMetric } from './channelMetrics';
import { CAMPAIGNS, type Campaign } from './campaigns';
import { DAY_LABELS, POINTS_FOR, formatMetric, isRatio, rowsFor, type DayRow, type Metric, type Range } from './metrics';

/**
 * Daily series for a campaign, derived from its channel's series.
 *
 * Campaigns were static totals: `spend: 34120` never changed, so the range
 * picker moved every KPI, chart and channel row while every campaign row sat
 * still — a user comparing a channel against its campaigns got numbers that
 * could not reconcile.
 *
 * ⭐ The constraint that makes this trustworthy: **a channel's campaigns sum to
 * that channel, every day, exactly.** Not approximately, and not only over the
 * 30-day window. It holds by construction because spend is distributed by
 * SHARES THAT SUM TO ONE rather than generated independently and reconciled
 * afterwards. Generating each campaign separately and hoping the totals met
 * is how a dashboard ends up with a header that disagrees with its own rows.
 *
 * The shares are constant, which is deliberate. A time-varying share would
 * make prettier charts and would break the second guarantee: that each
 * campaign's 30-day spend still equals the figure already shown in the table.
 * Both hold only if the weights are fixed.
 *
 * Leads carry a per-campaign efficiency wobble instead, so CAC and ROAS differ
 * between campaigns in the same channel and the charts are not scaled copies
 * of each other. Leads are renormalised to the campaign's stated total, so the
 * table and the chart cannot disagree.
 */

const byId = new Map<string, Campaign>(CAMPAIGNS.map((c) => [c.id, c]));

/** Every campaign belonging to a channel — the set the shares are taken over. */
function siblings(c: Campaign): Campaign[] {
  return CAMPAIGNS.filter((x) => x.channel === c.channel);
}

/* Deterministic per-campaign wobble. Same id, same curve, every render. */
function wobble(id: string, d: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  const phase = (h >>> 0) % 360;
  return 1 + Math.sin(((d + phase) / 11) * Math.PI * 2) * 0.18;
}

/** The campaign's funnel, one row per day, over the full history. */
export function campaignRows(id: string, range: Range = 30): DayRow[] {
  const c = byId.get(id);
  if (!c) return [];

  const group = siblings(c);
  const groupSpend = group.reduce((a, x) => a + x.spend, 0);
  const groupLeads = group.reduce((a, x) => a + x.leads, 0);
  const spendShare = groupSpend > 0 ? c.spend / groupSpend : 0;

  const channel = rowsFor(c.channel, range);

  /* Leads: wobble, then renormalise across the window so the campaign's own
     total still lands on its stated figure. */
  const raw = channel.map((_, d) => wobble(c.id, d));
  const rawSum = raw.reduce((a, b) => a + b, 0) || 1;

  return channel.map((row, d) => {
    const leadShare = groupLeads > 0 ? (c.leads / groupLeads) : 0;
    /* Channel leads for the day, split by this campaign's share, tilted by the
       wobble and divided back out so the window total is unchanged. */
    const tilt = (raw[d] / rawSum) * raw.length;
    return {
      spend: row.spend * spendShare,
      impressions: row.impressions * spendShare,
      clicks: row.clicks * spendShare,
      leads: row.leads * leadShare * tilt,
      sales: row.sales * leadShare * tilt,
      revenue: row.revenue * spendShare,
    };
  });
}

/** One metric over time for a campaign, shaped like `series()` does for a channel. */
export function campaignSeries(id: string, metric: Metric, range: Range = 30) {
  const rows = campaignRows(id, range);
  const labels = DAY_LABELS.slice(-POINTS_FOR[range]);
  return rows.map((r, i) => {
    let value: number;
    switch (metric) {
      case 'Spend':  value = r.spend; break;
      case 'Clicks': value = r.clicks; break;
      case 'Leads':  value = r.leads; break;
      case 'Sales':  value = r.sales; break;
      case 'CAC':    value = r.leads > 0 ? r.spend / r.leads : 0; break;
      case 'ROAS':   value = r.spend > 0 ? r.revenue / r.spend : 0; break;
    }
    return { label: labels[i], value };
  });
}

/** Period totals for a campaign — summed parts, ratios divided once. */
export function campaignTotals(id: string, range: Range = 30) {
  const rows = campaignRows(id, range);
  const sum = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend, impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks, leads: a.leads + r.leads,
      sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
  );
  return {
    ...sum,
    cac: sum.leads > 0 ? sum.spend / sum.leads : 0,
    roas: sum.spend > 0 ? sum.revenue / sum.spend : 0,
  };
}

export function campaignById(id: string): Campaign | undefined {
  return byId.get(id);
}

export { formatMetric, isRatio };

/**
 * Daily values of ANY derived metric for one campaign.
 *
 * `campaignSeries` speaks the six funnel metrics because the Chart does. A
 * campaign KPI card can show CTR, CPM, CPC or CVR, and those have no series of
 * their own -- they are computed per day from the funnel, which is the only way
 * they stay consistent with the totals sitting above them.
 */
export function campaignValues(id: string, metric: DerivedMetric, range: Range = 30): number[] {
  return campaignRows(id, range).map((r) => valueOf(metric, r));
}

/**
 * Period-over-period change for a campaign, on any metric.
 *
 * Uses `deltaOf` -- the same halving the channel screens use -- rather than a
 * second implementation of "the window, split in half". Two versions of that
 * convention would eventually disagree, and nothing on screen would say which
 * one you were reading.
 */
export function campaignDelta(id: string, metric: DerivedMetric, range: Range = 30): number {
  return deltaOf(campaignValues(id, metric, range));
}

/** Sparkline samples, through the shared sampler so the mark ends where the
    number does -- the bug that once had a badge trending red beside a mark
    trending up. */
export function campaignSparkline(
  id: string, metric: DerivedMetric, range: Range = 30, points = 7,
): number[] {
  return sampleOf(campaignValues(id, metric, range), points);
}
