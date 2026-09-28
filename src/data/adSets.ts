import { CAMPAIGNS, type AdSet, type Campaign } from './campaigns';
import { campaignRows, campaignSeries } from './campaignSeries';
import { valueOf, type DerivedMetric } from './channelMetrics';
import { deltaOf, sampleOf, type DayRow, type Metric, type Range } from './metrics';

/**
 * The ad-set tier, which until now had no numbers of its own.
 *
 * 🚨 What this fixes, stated plainly, because it was the largest gap between
 * what Growth is and what it claims:
 *
 * An ad set was five fields -- id, name, spend, leads, stage. No impressions,
 * no clicks, no revenue, no series, no page. The tier BELOW it had all of those:
 * an ad carries a daily funnel, a chart, a rank among its peers and a creative
 * preview. **The chain broke in the middle, and the child was richer than the
 * parent.** CampaignDetail had to apologise for it on screen -- "Ad set figures
 * are period totals and do not follow the date range" -- which made it the only
 * place in the product that explained itself away rather than working.
 *
 * ⚠️ And this is the tier where media buying actually happens. Budget, audience,
 * placement and bid all live here, not on the campaign and not on the ad. Going
 * campaign → ad skipped the level a buyer spends their day in.
 *
 * ⭐ The same construction the two tiers either side of it already use: a
 * CONSTANT SHARE of the parent's daily rows. Constant is the load-bearing word.
 * Generating the ad set's own series independently and reconciling afterwards is
 * how a dashboard ends up with a header that disagrees with its own rows. With a
 * fixed share, the ad sets sum to their campaign every day, exactly, by
 * construction -- and there is nothing to reconcile because nothing was ever
 * allowed to drift.
 *
 * The share is taken over SPEND, and spend only. Sharing leads separately would
 * let an ad set's CAC float free of the funnel it came from; deriving every
 * metric from one share means CAC, CPC, CTR and ROAS all stay consistent with
 * each other and with the campaign above.
 */

export interface AdSetRef {
  adSet: AdSet;
  campaign: Campaign;
}

/** The ad set and the campaign that owns it, or undefined for an unknown id. */
export function adSetById(id: string): AdSetRef | undefined {
  for (const campaign of CAMPAIGNS) {
    const adSet = campaign.adSets.find((a) => a.id === id);
    if (adSet) return { adSet, campaign };
  }
  return undefined;
}

/** Every ad set in the account, with its campaign — for cross-campaign views. */
export function allAdSets(): AdSetRef[] {
  return CAMPAIGNS.flatMap((campaign) => campaign.adSets.map((adSet) => ({ adSet, campaign })));
}

/**
 * This ad set's share of its campaign's spend. Shares within a campaign sum to 1.
 *
 * Taken over the SIBLINGS' stated spend rather than over the campaign's own
 * total, because those two can differ by a rounding step and the shares have to
 * sum to exactly one. If they summed to 0.999 the ad sets would quietly under-
 * report their campaign, by an amount too small to notice and large enough to
 * make a careful reader's arithmetic fail.
 */
export function adSetShare(id: string): number {
  const ref = adSetById(id);
  if (!ref) return 0;
  const total = ref.campaign.adSets.reduce((a, x) => a + x.spend, 0);
  return total > 0 ? ref.adSet.spend / total : 0;
}

/** Daily funnel for one ad set, scaled out of its campaign's. Follows the range. */
export function adSetRows(id: string, range: Range = 30): DayRow[] {
  const ref = adSetById(id);
  if (!ref) return [];
  const share = adSetShare(id);
  return campaignRows(ref.campaign.id, range).map((r) => ({
    spend: r.spend * share,
    impressions: r.impressions * share,
    clicks: r.clicks * share,
    leads: r.leads * share,
    sales: r.sales * share,
    revenue: r.revenue * share,
  }));
}

/** Period totals — parts summed, ratios divided once at the end. */
export function adSetTotals(id: string, range: Range = 30) {
  const sum = adSetRows(id, range).reduce(
    (a, r) => ({
      spend: a.spend + r.spend, impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks, leads: a.leads + r.leads,
      sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
  );
  /* Divided ONCE, from the summed funnel -- never averaged across days. A
     period's CAC is total spend over total leads, not the mean of each day's
     CAC, and the two are different numbers. */
  return {
    ...sum,
    cac: sum.leads > 0 ? sum.spend / sum.leads : 0,
    roas: sum.spend > 0 ? sum.revenue / sum.spend : 0,
  };
}

/** One funnel metric over time, in the shape Chart expects. */
export function adSetSeries(id: string, metric: Metric, range: Range = 30) {
  const ref = adSetById(id);
  if (!ref) return [];
  const rows = adSetRows(id, range);
  /* Labels borrowed from the campaign's own series rather than re-sliced out of
     DAY_LABELS here. One owner of the axis: if the history length ever changes,
     the ad-set chart cannot end up labelled differently from the campaign chart
     directly above it. */
  const labels = campaignSeries(ref.campaign.id, metric, range).map((p) => p.label);

  return rows.map((r, i) => {
    let value: number;
    switch (metric) {
      case 'Spend':  value = r.spend; break;
      case 'Clicks': value = r.clicks; break;
      case 'Leads':  value = r.leads; break;
      case 'Sales':  value = r.sales; break;
      /* Recomputed per day from THIS ad set's funnel. Scaling the campaign's
         CAC by the share would be wrong twice over: a ratio does not scale, and
         the result would be the campaign's number wearing the ad set's name. */
      case 'CAC':    value = r.leads > 0 ? r.spend / r.leads : 0; break;
      case 'ROAS':   value = r.spend > 0 ? r.revenue / r.spend : 0; break;
    }
    return { label: labels[i] ?? '', value };
  });
}

/** Daily values of ANY derived metric — what the KPI cards need. */
export function adSetValues(id: string, metric: DerivedMetric, range: Range = 30): number[] {
  return adSetRows(id, range).map((r) => valueOf(metric, r));
}

/** Period-over-period change, through the shared `deltaOf` rather than a second
    implementation of "the window, split in half". */
export function adSetDelta(id: string, metric: DerivedMetric, range: Range = 30): number {
  return deltaOf(adSetValues(id, metric, range));
}

/** Sparkline samples through the shared sampler, so the mark ends where the
    number does. */
export function adSetSparkline(
  id: string, metric: DerivedMetric, range: Range = 30, points = 7,
): number[] {
  return sampleOf(adSetValues(id, metric, range), points);
}
