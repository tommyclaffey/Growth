import { describe, it, expect } from 'vitest';
import { RANK_METRICS, rankedAds } from '../adRanking';
import { CHANNEL_METRICS, valueOf } from '../channelMetrics';
import { CAMPAIGNS } from '../campaigns';
import { creativesFor } from '../creative';
import { campaignTotals } from '../campaignSeries';
import { ALL_CHANNELS } from '../blended';
import { CHANNEL_KEYS, RANGES, setActiveChannels } from '../metrics';

const reset = () => setActiveChannels([...CHANNEL_KEYS]);

describe('the ranking covers every ad and reconciles upward', () => {
  it('includes every ad in every active campaign', () => {
    reset();
    const expected = CAMPAIGNS.reduce((a, c) => a + creativesFor(c.id).length, 0);
    expect(rankedAds('CAC', 'relative', 30, ALL_CHANNELS)).toHaveLength(expected);
  });

  it('a campaign’s ads sum to that campaign at every range', () => {
    reset();
    for (const range of RANGES) {
      const rows = rankedAds('Spend', 'absolute', range, ALL_CHANNELS);
      for (const c of CAMPAIGNS) {
        const mine = rows.filter((r) => r.campaign.id === c.id);
        const spend = mine.reduce((a, r) => a + r.totals.spend, 0);
        expect(spend).toBeCloseTo(campaignTotals(c.id, range).spend, 6);
      }
    }
  });

  it('follows the date range', () => {
    reset();
    const seen = RANGES.map(
      (r) => rankedAds('Spend', 'absolute', r, ALL_CHANNELS)[0].totals.spend.toFixed(4),
    );
    expect(new Set(seen).size).toBe(RANGES.length);
  });

  it('a channel switched off disappears entirely', () => {
    /* The rule the whole app follows: not greyed out, gone. */
    const rows = rankedAds('CAC', 'relative', 30, ['meta']);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.channel === 'meta')).toBe(true);
  });

  it('an empty account ranks nothing rather than throwing', () => {
    expect(rankedAds('CAC', 'relative', 30, [])).toEqual([]);
  });
});

describe('⭐ the claim the screen rests on', () => {
  it('an absolute CAC ranking is dominated by channel economics', () => {
    reset();
    /* 🔄 REWRITTEN, and the reason is worth keeping.

       The original assertion was that a raw CAC sort re-derives the channel
       ranking EXACTLY -- that the channels clump perfectly going down the list.
       It passed, and it passed for the wrong reason: at the time, every ad inside
       a campaign had an identical CAC by construction (G-013), so a raw sort had
       nothing to order by except channel. The claim was true of the FIXTURE, not
       of the product.

       With real ad-level variation in place, a strong ad on an expensive channel
       can now out-price a weak ad on a cheap one, so perfect clumping is gone --
       correctly. The argument for relative mode survives in a better form:
       the channel SPREAD ($36 to $129 a lead) dwarfs the within-channel spread,
       so a raw ranking is still governed by which channel an ad ran on. The
       expensive channels never reach the top no matter how well their ads did
       for that channel, which is exactly what makes the raw view repeat the
       channel table. */
    const ranked = rankedAds('CAC', 'absolute', 30, ALL_CHANNELS);

    /* Each channel's own blended CAC, cheapest first. */
    const channelCac = [...new Set(ranked.map((r) => r.channel))]
      .map((ch) => {
        const mine = ranked.filter((r) => r.channel === ch);
        const spend = mine.reduce((a, r) => a + r.totals.spend, 0);
        const leads = mine.reduce((a, r) => a + r.totals.leads, 0);
        return { ch, cac: spend / leads };
      })
      .sort((a, b) => a.cac - b.cac);

    const cheapest = channelCac[0].ch;
    const dearest = channelCac[channelCac.length - 1].ch;
    const topQuartile = ranked.slice(0, Math.ceil(ranked.length / 4));

    /* The cheapest channel is over-represented at the top... */
    expect(topQuartile.filter((r) => r.channel === cheapest).length).toBeGreaterThan(0);
    /* ...and the dearest channel cannot reach it at all, however good its ads
       are relative to their own peers. That is the whole problem. */
    expect(topQuartile.some((r) => r.channel === dearest)).toBe(false);
  });

  it('relative mode surfaces ads that the raw ranking buries', () => {
    reset();
    /* ⭐ The claim in its strongest form, and now empirically true rather than
       an artifact of flat data.

       Relative mode reaches across MORE channels than absolute does, because it
       asks "is this ad beating its own channel" instead of "is this ad cheap".
       A paid-search ad at $73 a lead ranks high on that question and is invisible
       on the other one. */
    const n = 10;
    const absChannels = new Set(
      rankedAds('CAC', 'absolute', 30, ALL_CHANNELS).slice(0, n).map((r) => r.channel));
    const relChannels = new Set(
      rankedAds('CAC', 'relative', 30, ALL_CHANNELS).slice(0, n).map((r) => r.channel));

    expect(relChannels.size).toBeGreaterThan(absChannels.size);

    /* And concretely: at least one ad in the relative top-10 would not be in the
       absolute top-10 at all. */
    const absTop = new Set(
      rankedAds('CAC', 'absolute', 30, ALL_CHANNELS).slice(0, n).map((r) => r.creative.id));
    const relTop = rankedAds('CAC', 'relative', 30, ALL_CHANNELS).slice(0, n);
    expect(relTop.some((r) => !absTop.has(r.creative.id))).toBe(true);
  });

  it('relative ranking does NOT simply reproduce that order', () => {
    reset();
    /* Which is the whole point: the relative view surfaces an ad beating its own
       channel even when its raw number is worse than another channel's. */
    const abs = rankedAds('CAC', 'absolute', 30, ALL_CHANNELS).map((r) => r.creative.id);
    const rel = rankedAds('CAC', 'relative', 30, ALL_CHANNELS).map((r) => r.creative.id);
    expect(rel).not.toEqual(abs);
  });

  it('an ad can beat its own channel while looking poor in raw terms', () => {
    reset();
    /* 🔄 Replaced an assertion that rel[0] !== abs[0], which is not the property
       that matters -- the single best ad on a channel may well be the single
       cheapest overall, and that coincidence would have failed a test for no
       reason. The property is that SOMEWHERE in the relative top half sits an ad
       whose raw CAC is worse than the median. That is the finding the mode
       exists to produce. */
    const rel = rankedAds('CAC', 'relative', 30, ALL_CHANNELS);
    const cacs = rel.map((r) => r.totals.spend / r.totals.leads).sort((a, b) => a - b);
    const median = cacs[Math.floor(cacs.length / 2)];
    const topHalf = rel.slice(0, Math.floor(rel.length / 2));
    expect(topHalf.some((r) => r.totals.spend / r.totals.leads > median)).toBe(true);
  });
});

describe('direction is never re-decided', () => {
  it('absolute CAC ranks cheapest first, absolute Leads ranks highest first', () => {
    reset();
    const cac = rankedAds('CAC', 'absolute', 30, ALL_CHANNELS);
    for (let i = 1; i < cac.length; i += 1) {
      expect(cac[i].value!).toBeGreaterThanOrEqual(cac[i - 1].value! - 1e-9);
    }
    const leads = rankedAds('Leads', 'absolute', 30, ALL_CHANNELS);
    for (let i = 1; i < leads.length; i += 1) {
      expect(leads[i].value!).toBeLessThanOrEqual(leads[i - 1].value! + 1e-9);
    }
  });

  it('relative ranking puts every out-performer above every under-performer', () => {
    reset();
    const rows = rankedAds('CAC', 'relative', 30, ALL_CHANNELS)
      .filter((r) => r.benchmark !== null);
    const lastBetter = rows.reduce((acc, r, i) => (r.benchmark!.better ? i : acc), -1);
    const firstWorse = rows.findIndex((r) => !r.benchmark!.better);
    if (firstWorse !== -1) expect(lastBetter).toBeLessThan(firstWorse);
  });
});

describe('a metric nobody can rank on is not offered', () => {
  it('every rank metric is reported by EVERY channel', () => {
    /* A CTR ranking would exclude podcasts and affiliates and still call itself
       "all ads". Restricting the selector is what keeps the title true. */
    for (const m of RANK_METRICS) {
      for (const c of CHANNEL_KEYS) {
        expect(CHANNEL_METRICS[c]).toContain(m);
      }
    }
  });
});

describe('benchmarks compare an ad to ADS, not to campaigns', () => {
  it('the population size is the channel’s ad count', () => {
    reset();
    const rows = rankedAds('CAC', 'relative', 30, ALL_CHANNELS);
    for (const ch of CHANNEL_KEYS) {
      const mine = rows.filter((r) => r.channel === ch);
      const withBench = mine.filter((r) => r.benchmark !== null);
      if (withBench.length === 0) continue;
      /* Comparing an ad against the average CAMPAIGN would be comparing a part
         to a whole and reporting it as a verdict. */
      expect(withBench[0].benchmark!.n).toBe(mine.length);
      expect(withBench[0].benchmark!.n).not.toBe(
        CAMPAIGNS.filter((c) => c.channel === ch).length,
      );
    }
  });

  it('the benchmark value matches the channel’s own summed rate', () => {
    reset();
    const rows = rankedAds('CAC', 'relative', 30, ALL_CHANNELS);
    for (const ch of CHANNEL_KEYS) {
      const mine = rows.filter((r) => r.channel === ch);
      const b = mine.find((r) => r.benchmark)?.benchmark;
      if (!b) continue;
      const sum = mine.reduce((a, r) => ({
        spend: a.spend + r.totals.spend, impressions: a.impressions + r.totals.impressions,
        clicks: a.clicks + r.totals.clicks, leads: a.leads + r.totals.leads,
        sales: a.sales + r.totals.sales, revenue: a.revenue + r.totals.revenue,
      }), { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });
      expect(b.value).toBeCloseTo(valueOf('CAC', sum), 8);
    }
  });
});
