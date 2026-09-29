import { CAMPAIGNS, type AdSet, type Campaign } from './campaigns';
import { campaignRows, campaignSeries } from './campaignSeries';
import { valueOf, type DerivedMetric } from './channelMetrics';
import { changeOf, sampleOf, sliceWindow, type DayRow, type Metric, type Range } from './metrics';

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

/**
 * An efficiency wobble, deterministic per id.
 *
 * 🚨 G-013. Every tier below the campaign used ONE share — spend — for the whole
 * funnel, which meant leads moved in exact lockstep with spend and **every ad
 * set inside a campaign had an identical CAC.** So did every ad. `c1a-cr1` and
 * `c1a-cr3` both came out at exactly $34.31.
 *
 * That is not a cosmetic flatness. It meant *"which ad is underperforming"* had
 * no answer, `rankCreatives` by CAC was a no-op that fell through to its
 * tie-break, and the decision engine's two most valuable detectors — pause a
 * loser, scale a winner — could never fire. **The engine finding nothing is what
 * exposed it.**
 *
 * `metrics.ts` already solved this one level up and said why: *"If leads were
 * simply spend / cac, then CAC would be the constant cac, every single day… the
 * metric doing nothing while appearing to work."* Same defect, one tier down.
 */
/**
 * How wide the spread is, and why these two numbers differ.
 *
 * ⚠️ The first pass used ±15% for both, which was too tight to be real — and the
 * decision engine proved it by still finding nothing. A ±15% efficiency band
 * produces a worst-to-best ratio of about 1.2, so no ad was ever badly enough
 * out of line to be worth pausing. **The flatness had been reduced, not fixed.**
 *
 * In a real account these two tiers do not vary by the same amount:
 *
 *   **Ads** — creative is the single biggest lever in paid media, and the spread
 *   between a winning hook and a dead one inside one ad set is routinely 2–3×.
 *   ±45% gives a ~2.6× worst-to-best ratio, which is realistic and is enough for
 *   "pause this one" to be a real finding rather than noise.
 *
 *   **Ad sets** — an audience or placement band. Narrower, because the ad sets
 *   inside a campaign were usually built to be comparable. ±20%.
 *
 * Both stay deterministic and both renormalise, so nothing above them moves.
 */
export const AD_SPREAD = 0.9;
export const AD_SET_SPREAD = 0.4;

export function adSetWobble(id: string, spread = AD_SET_SPREAD): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  /* 0..1 from the hash, mapped to 1 ± spread/2. Deterministic, so a screenshot
     is reproducible and the same ad is the same ad on every render. */
  return 1 - spread / 2 + ((h >>> 0) % 1000) / 1000 * spread;
}

/**
 * An ad set's share of its campaign's LEADS — wobbled, then renormalised.
 *
 * ⭐ Renormalisation is what makes this safe. The wobble makes ad sets differ
 * from each other; dividing by the group's total wobbled weight puts the sum
 * back to exactly one. So CAC varies between ad sets **and** the ad sets still
 * add up to their campaign every day, exactly. Both guarantees hold, and the
 * reconciliation tests check the second one.
 */
export function adSetLeadShare(id: string): number {
  const ref = adSetById(id);
  if (!ref) return 0;
  const sibs = ref.campaign.adSets;
  const total = sibs.reduce((a, x) => a + x.spend, 0);
  if (total <= 0) return 0;
  /* Weighted by spend share, tilted by the wobble. Starting from spend keeps a
     big ad set big -- the wobble changes its EFFICIENCY, not its size. */
  const weights = sibs.map((x) => (x.spend / total) * adSetWobble(x.id));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const i = sibs.findIndex((x) => x.id === id);
  return weights[i] / sum;
}

/** Daily funnel for one ad set, scaled out of its campaign's. Follows the range. */
/* A real account's ad-set days -- used as-is when present; the share
   derivation below is only how the seed fakes them. */
let SOURCE_ADSET_ROWS: Map<string, DayRow[]> | null = null;
export function setAdSetRows(rows: Map<string, DayRow[]> | null): void {
  SOURCE_ADSET_ROWS = rows;
}

export function adSetRows(id: string, range: Range = 30, back = 0, shift = 0): DayRow[] {
  const real = SOURCE_ADSET_ROWS?.get(id);
  if (real) return sliceWindow(real, range, back, shift);
  const ref = adSetById(id);
  if (!ref) return [];
  /* Spend, impressions and clicks follow SPEND share -- what you bought.
     Leads, sales and revenue follow the LEAD share -- what it returned. The gap
     between the two is the ad set's efficiency, and it is the only reason CAC
     and ROAS differ between siblings at all. */
  const spendShare = adSetShare(id);
  const leadShare = adSetLeadShare(id);
  return campaignRows(ref.campaign.id, range, back, shift).map((r) => ({
    spend: r.spend * spendShare,
    impressions: r.impressions * spendShare,
    clicks: r.clicks * spendShare,
    leads: r.leads * leadShare,
    sales: r.sales * leadShare,
    revenue: r.revenue * leadShare,
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

/** Period-over-period change: this window against the one before it, through
    the shared `changeOf`. */
export function adSetDelta(id: string, metric: DerivedMetric, range: Range = 30): number {
  return changeOf(metric, adSetRows(id, range), adSetRows(id, range, 1));
}

/** Sparkline samples through the shared sampler, so the mark ends where the
    number does. */
export function adSetSparkline(
  id: string, metric: DerivedMetric, range: Range = 30, points = 7,
): number[] {
  return sampleOf(adSetValues(id, metric, range), points);
}
