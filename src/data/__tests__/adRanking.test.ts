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
  it('an absolute CAC ranking just re-derives the channel ranking', () => {
    reset();
    /* The reason relative is the default. If a raw cross-channel sort told you
       something the channel table does not, this screen would not need a mode.

       Sorted by raw CAC, the ads clump by channel -- so the sequence of channels
       first-seen going down the list is simply the channels ordered by CAC. */
    const rows = rankedAds('CAC', 'absolute', 30, ALL_CHANNELS);
    const firstSeen: string[] = [];
    for (const r of rows) if (!firstSeen.includes(r.channel)) firstSeen.push(r.channel);

    /* Each channel's own blended CAC, ascending -- lower is better for CAC. */
    const byChannelCac = [...new Set(rows.map((r) => r.channel))]
      .map((ch) => {
        const mine = rows.filter((r) => r.channel === ch);
        const spend = mine.reduce((a, r) => a + r.totals.spend, 0);
        const leads = mine.reduce((a, r) => a + r.totals.leads, 0);
        return { ch, cac: spend / leads };
      })
      .sort((a, b) => a.cac - b.cac)
      .map((x) => x.ch);

    expect(firstSeen).toEqual(byChannelCac);
  });

  it('relative ranking does NOT simply reproduce that order', () => {
    reset();
    /* Which is the whole point: the relative view surfaces an ad beating its own
       channel even when its raw number is worse than another channel's. */
    const abs = rankedAds('CAC', 'absolute', 30, ALL_CHANNELS).map((r) => r.creative.id);
    const rel = rankedAds('CAC', 'relative', 30, ALL_CHANNELS).map((r) => r.creative.id);
    expect(rel).not.toEqual(abs);
  });

  it('the top relative ad is not always from the cheapest channel', () => {
    reset();
    const rel = rankedAds('CAC', 'relative', 30, ALL_CHANNELS);
    const abs = rankedAds('CAC', 'absolute', 30, ALL_CHANNELS);
    /* If it were, relative mode would be a re-sort with no new information. */
    expect(rel[0].creative.id).not.toBe(abs[0].creative.id);
  });
});

describe('direction is never re-decided', () => {
  it('absolute CAC ranks cheapest first, absolute Leads ranks highest first', () => {
    reset();
    const cac = rankedAds('CAC', 'absolute', 30, ALL_CHANNELS);
    for (let i = 1; i < cac.length; i += 1) {
      expect(cac[i].value).toBeGreaterThanOrEqual(cac[i - 1].value - 1e-9);
    }
    const leads = rankedAds('Leads', 'absolute', 30, ALL_CHANNELS);
    for (let i = 1; i < leads.length; i += 1) {
      expect(leads[i].value).toBeLessThanOrEqual(leads[i - 1].value + 1e-9);
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
