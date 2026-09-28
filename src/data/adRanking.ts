import type { ChannelName } from '../styles/tokens';
import { CAMPAIGNS, type Campaign } from './campaigns';
import { campaignRows } from './campaignSeries';
import { creativeLeadShare, creativesFor, type Creative } from './creative';
import { betterHigher, valueOf, type DerivedMetric } from './channelMetrics';
import {
  EMPTY_FUNNEL, addFunnel, benchmarkAgainst, type Benchmark, type Funnel,
} from './benchmark';
import { activeChannels, type Range } from './metrics';

/**
 * Every ad in the account, ranked — the micro end of the macro view.
 *
 * The product could rank the ads INSIDE one campaign. It could not answer
 * *"which of my ~40 ads is winning, across everything?"*, which is the question a
 * marketer actually opens a dashboard to ask, and the exact point where the micro
 * end meets the macro one.
 *
 * ⭐ THE DESIGN DECISION, and it is the whole reason this is more than a sorted
 * list: **ranking ads across channels by raw CAC just re-derives the channel
 * ranking.** Podcasts average ~$129 a lead and Meta ~$36, so a global sort by CAC
 * puts every Meta ad on top and every podcast spot at the bottom — every time,
 * regardless of how those ads are actually performing. The reader learns nothing
 * they could not already read off the channel table, and worse, it implies the
 * podcast spots are the problem when they may be the best podcast spots available.
 *
 * ⚠️ Comparing a podcast ad's CAC to a Meta ad's CAC is comparing two different
 * media economics, not two ads. The same category error as printing a CTR for an
 * audio ad, one level up.
 *
 * **So the default rank is CHANNEL-RELATIVE**: how far each ad sits from the
 * average ad on its OWN channel. That question has an answer that is not already
 * on another screen — a podcast spot 30% below its channel's CAC is a genuine
 * find, and it ranks above a Meta ad sitting exactly at Meta's average even
 * though the Meta ad's raw CAC is three times better.
 *
 * The absolute ranking stays available, because "where is the money going" is
 * also a real question. It is just not the one that needed a new screen.
 */

export type RankMode = 'relative' | 'absolute';

/** Metrics every channel reports, so the ranking never excludes a channel. */
export const RANK_METRICS: DerivedMetric[] = ['Spend', 'Leads', 'CAC', 'ROAS'];

export interface RankedAd {
  creative: Creative;
  campaign: Campaign;
  channel: ChannelName;
  /** Ranged totals — this screen follows the date picker. */
  totals: Funnel;
  value: number;
  /** Against the average ad on its own channel. Null when the channel runs one ad. */
  benchmark: Benchmark | null;
}

/**
 * Every ad with its ranged funnel, computed in one pass.
 *
 * ⚠️ Deliberately NOT built by calling `creativeTotals` per ad. That resolves the
 * ad by scanning every campaign and regenerating every campaign's creatives to
 * find one — so ranking forty ads would regenerate the creative set several
 * hundred times. Here each campaign's rows are scaled once and its ads read off
 * them, which is the same arithmetic with the loops the right way round.
 *
 * Shares are taken within the campaign and sum to one, the same construction the
 * ad-set and campaign tiers use, so an ad's numbers reconcile upward by
 * construction rather than by a reconciliation pass.
 */
function gather(range: Range, channels: ChannelName[]): Omit<RankedAd, 'value' | 'benchmark'>[] {
  const out: Omit<RankedAd, 'value' | 'benchmark'>[] = [];

  for (const campaign of CAMPAIGNS) {
    if (!channels.includes(campaign.channel)) continue;

    const ads = creativesFor(campaign.id);
    if (ads.length === 0) continue;

    /* Summed once per campaign, not once per ad. */
    const period = campaignRows(campaign.id, range).reduce(addFunnel, EMPTY_FUNNEL);
    const totalSpend = ads.reduce((a, c) => a + c.spend, 0);

    for (const creative of ads) {
      const share = totalSpend > 0 ? creative.spend / totalSpend : 0;
      /* ⚠️ The SAME lead share `creativeRows` uses, not a second calculation.
         This module computes ad totals on its own path for speed -- one pass per
         campaign rather than resolving each ad individually. That is fine for
         the arithmetic and dangerous for the RULE: two places deriving an ad's
         leads would drift, and the Ads ranking would disagree with the ad's own
         page while both looked authoritative. The loop is local; the share is
         shared. */
      const leadShare = creativeLeadShare(creative.id);
      out.push({
        creative,
        campaign,
        channel: campaign.channel,
        totals: {
          spend: period.spend * share,
          impressions: period.impressions * share,
          clicks: period.clicks * share,
          leads: period.leads * leadShare,
          sales: period.sales * leadShare,
          revenue: period.revenue * leadShare,
        },
      });
    }
  }

  return out;
}

/**
 * Ads ranked, with each one's standing against its own channel.
 *
 * The benchmark population is the ads on that channel — not its campaigns. An ad
 * compared against the average CAMPAIGN would be comparing a part to a whole and
 * reporting it as a verdict, which is the "share dressed as a benchmark" mistake
 * `benchmark.ts` was written to avoid.
 */
export function rankedAds(
  metric: DerivedMetric,
  mode: RankMode = 'relative',
  range: Range = 30,
  channels: ChannelName[] = activeChannels(),
): RankedAd[] {
  const gathered = gather(range, channels);

  /* One summed funnel per channel, over its ADS, plus how many there are. */
  const byChannel = new Map<ChannelName, { sum: Funnel; n: number }>();
  for (const a of gathered) {
    const cur = byChannel.get(a.channel) ?? { sum: EMPTY_FUNNEL, n: 0 };
    byChannel.set(a.channel, { sum: addFunnel(cur.sum, a.totals), n: cur.n + 1 });
  }

  const ranked: RankedAd[] = gathered.map((a) => {
    const pop = byChannel.get(a.channel)!;
    return {
      ...a,
      value: valueOf(metric, a.totals),
      benchmark: benchmarkAgainst(metric, pop.sum, pop.n, valueOf(metric, a.totals),
        { count: 'ad-average', rate: 'channel-ad-rate' }),
    };
  });

  return sortRanked(ranked, metric, mode);
}

/**
 * Best first, for whichever question is being asked.
 *
 * ⚠️ "Best" is not "highest". A falling CAC is the win, and `betterHigher` owns
 * that rule for the whole app — re-deciding it here is exactly how the CAC
 * inversion happened the first time. In relative mode the sign is already
 * resolved into `deltaPercent` plus `better`, so the sort reads `better` rather
 * than guessing again.
 */
function sortRanked(list: RankedAd[], metric: DerivedMetric, mode: RankMode): RankedAd[] {
  const signed = (a: RankedAd): number => {
    if (mode === 'absolute') return a.value;
    const b = a.benchmark;
    /* No benchmark means a channel with one ad. It cannot be ranked against
       peers it does not have, so it sorts last rather than being given a 0%
       that would place it mid-table as if it were merely average. */
    if (!b) return Number.NEGATIVE_INFINITY;
    /* How far it beats its channel, in the direction that is good for this
       metric. A CAC 20% BELOW the channel is +20 here. */
    return b.better ? Math.abs(b.deltaPercent) : -Math.abs(b.deltaPercent);
  };

  /* In absolute mode the direction still comes from betterHigher. */
  const dir = mode === 'absolute' && !betterHigher(metric) ? 1 : -1;

  return [...list].sort((x, y) => {
    const d = (signed(x) - signed(y)) * dir;
    /* A TOTAL order. Without tie-breaks the same data can render in a different
       sequence between renders, which reads as the list shuffling on its own. */
    return d !== 0 ? d
      : (y.totals.spend - x.totals.spend) || x.creative.id.localeCompare(y.creative.id);
  });
}
