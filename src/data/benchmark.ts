import { CAMPAIGNS } from './campaigns';
import { type Range } from './metrics';
import { campaignTotals } from './campaignSeries';
import type { ChannelName } from '../styles/tokens';
import { betterHigher, formatDerived, valueOf, type DerivedMetric } from './channelMetrics';

/**
 * How one campaign compares to the channel it runs on.
 *
 * "$34.31 CAC" is not information. It becomes information next to "$29.80 is
 * what Meta averages" -- the number stops being a fact and becomes a verdict.
 *
 * ⚠️ The comparison is NOT the same calculation for every metric, and getting
 * this wrong is the easy mistake:
 *
 *   COUNTS (Spend, Impressions, Clicks, Leads, Sales) -- comparing a campaign's
 *   leads to the CHANNEL'S TOTAL leads is not a benchmark, it is a share. The
 *   honest comparison is the average campaign on that channel, so the channel
 *   total is divided by the number of campaigns running on it.
 *
 *   RATES (CTR, CPC, CPM, CAC, ROAS, CVR) -- already normalised by definition.
 *   Dividing a CAC by the campaign count would be meaningless. The comparison
 *   is the channel's own rate, computed from channel totals rather than by
 *   averaging per-campaign rates, so a $90k campaign is not given the same
 *   weight as a $900 one.
 */
export interface Benchmark {
  /** What the channel does on this metric — an average, or a rate. */
  value: number;
  /** The campaign against it, signed. Positive means the campaign is higher. */
  deltaPercent: number;
  /** Higher is not always better. CAC above the channel average is bad news. */
  better: boolean;
  basis: 'campaign-average' | 'channel-rate';
  /** Campaigns the average is drawn from — the caption says so. */
  n: number;
}

const COUNTS: DerivedMetric[] = ['Spend', 'Impressions', 'Clicks', 'Leads', 'Sales'];

export function benchmarkFor(
  channel: ChannelName, metric: DerivedMetric, range: Range, actual: number,
): Benchmark | null {
  const peers = CAMPAIGNS.filter((c) => c.channel === channel);
  const n = peers.length;

  /* A channel running one campaign has no benchmark -- the "average" would be
     that campaign, so every card would read "0% vs average" and mean nothing.
     Showing no comparison is better than showing a tautology. */
  if (n < 2) return null;

  /* Summed from the CAMPAIGNS, not from channel totals divided by n.
     The two are within ~0.2% of each other, and the difference is the point:
     the campaign series carries a small per-campaign wobble, so channel totals
     and the sum of their campaigns are not bit-identical at every range. A
     reader can add the campaign table up by hand -- the benchmark has to be
     the number they would get, not one that is 1.4 leads away from it and
     unverifiable from anything on screen. */
  const sum = peers.reduce((a, c) => {
    const t = campaignTotals(c.id, range);
    return {
      spend: a.spend + t.spend, impressions: a.impressions + t.impressions,
      clicks: a.clicks + t.clicks, leads: a.leads + t.leads,
      sales: a.sales + t.sales, revenue: a.revenue + t.revenue,
    };
  }, { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });

  const isCount = COUNTS.includes(metric);
  /* Rates come from the SUMMED funnel, not the mean of each campaign's rate --
     that weights by spend, so a $90k campaign does not get the same vote as a
     $900 one. */
  const channelValue = valueOf(metric, sum);
  const value = isCount ? channelValue / n : channelValue;

  if (!Number.isFinite(value) || value === 0 || !Number.isFinite(actual)) return null;

  const deltaPercent = ((actual - value) / value) * 100;
  return {
    value,
    deltaPercent,
    /* Sign alone does not say good or bad. betterHigher owns that rule for the
       whole app; re-deciding it here is how the CAC direction bug happened. */
    better: (deltaPercent >= 0) === betterHigher(metric),
    basis: isCount ? 'campaign-average' : 'channel-rate',
    n,
  };
}

/**
 * The note beside the pill, e.g. "Your Meta avg $29.80".
 *
 * ⚠️ "Meta avg" was WRONG, and wrong in an expensive direction. It reads as
 * Meta's INDUSTRY average -- the benchmark every advertiser actually wants --
 * and that is a claim this product cannot make. Growth sees one account's
 * connected ad accounts. It has no idea what other advertisers pay for a lead,
 * and a label implying otherwise invites someone to make a budget decision
 * against a number that does not exist.
 *
 * "Your" is the whole fix: it scopes the comparison to this workspace's own
 * Meta campaigns, which is exactly what was computed.
 *
 * Kept short because it shares a 233px card with the pill. The full sentence,
 * including how many campaigns the average is drawn from, rides on the title
 * attribute rather than being cut for width.
 *
 * "avg" appears only for counts, where the benchmark genuinely IS an average
 * of campaigns. A rate is the account's own blended number, and calling that an
 * average would describe a calculation nobody performed.
 */
export function benchmarkLabel(m: DerivedMetric, b: Benchmark, channelLabel: string): string {
  return b.basis === 'campaign-average'
    ? `Your ${channelLabel} avg ${formatDerived(m, b.value)}`
    : `Your ${channelLabel} ${formatDerived(m, b.value)}`;
}

/**
 * The unabbreviated version, for the title attribute and assistive tech.
 *
 * States the scope, the population and the calculation, so nobody has to infer
 * any of the three from four words on a small card.
 */
export function benchmarkTitle(m: DerivedMetric, b: Benchmark, channelLabel: string): string {
  const value = formatDerived(m, b.value);
  return b.basis === 'campaign-average'
    ? `${value} is the average ${m} across your ${b.n} ${channelLabel} campaigns in this workspace. Not an industry benchmark.`
    : `${value} is your blended ${m} across all ${b.n} ${channelLabel} campaigns in this workspace, weighted by spend. Not an industry benchmark.`;
}
