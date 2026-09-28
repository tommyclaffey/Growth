import { describe, it, expect } from 'vitest';
import {
  ALL_CHANNELS, blendedDelta, blendedMetrics, blendedTotal, blendedValues,
  coverageFor, coverageNote, coverageTitle,
} from '../blended';
import { CHANNEL_METRICS, headlineKpis, valueOf } from '../channelMetrics';
import { CHANNEL_KEYS, RANGES, rowsFor, setActiveChannels, totals } from '../metrics';

const reset = () => setActiveChannels([...CHANNEL_KEYS]);

describe('coverage is honest about which channels report what', () => {
  it('podcasts have no click, affiliates no impression', () => {
    expect(coverageFor('Clicks', ALL_CHANNELS)).not.toContain('podcasts');
    expect(coverageFor('Impressions', ALL_CHANNELS)).not.toContain('affiliates');
    expect(coverageFor('Impressions', ALL_CHANNELS)).not.toContain('paidSearch');
  });

  it('CTR needs BOTH sides, so it covers fewer channels than either', () => {
    const ctr = coverageFor('CTR', ALL_CHANNELS);
    const clicks = coverageFor('Clicks', ALL_CHANNELS);
    const impressions = coverageFor('Impressions', ALL_CHANNELS);
    expect(ctr.length).toBeLessThan(clicks.length);
    expect(ctr.length).toBeLessThanOrEqual(impressions.length);
  });

  it('spend, leads, CAC and ROAS cover everything', () => {
    for (const m of ['Spend', 'Leads', 'CAC', 'ROAS'] as const) {
      expect(coverageFor(m, ALL_CHANNELS)).toHaveLength(ALL_CHANNELS.length);
      /* No note, because a caveat on a complete blend is noise -- and noise on
         the cards that do not need it is what stops anyone reading the one that
         does. */
      expect(coverageNote(m, ALL_CHANNELS)).toBeNull();
      expect(coverageTitle(m, ALL_CHANNELS)).toBeUndefined();
    }
  });

  it('a partial blend says how many channels, and names the excluded ones', () => {
    expect(coverageNote('CTR', ALL_CHANNELS)).toMatch(/of 6 channels/);
    const title = coverageTitle('CTR', ALL_CHANNELS)!;
    expect(title).toContain('Excluded');
    expect(title).toContain('Podcasts');
  });
});

describe('🚨 the trap: a rate must not be divided by the wrong denominator', () => {
  it('blended CPC is NOT all spend over all clicks', () => {
    reset();
    /* The defect this module exists to prevent, and the reason "just show more
       metrics" was never the fix.

       ⚠️ NOTE ON DIRECTION. The first version of this test asserted the scoped
       figure would be LOWER than the naive one, on the reasoning that podcast
       spend sits in the numerator having produced no clicks. It fails, and the
       failure was informative twice over.

       First: CPC covers only THREE channels, not five. YouTube is bought on CPM
       and Google Ads reports no CPC for it, and affiliates are paid on
       performance -- so CHANNEL_METRICS excludes CPC from both. The scoped set
       is Meta, TikTok and Paid Search, and Paid Search costs $3.53 a click,
       which pulls the scoped figure UP rather than down.

       Second, and this is the one that matters: see G-011. The seeded data gives
       podcasts 7,919 clicks and affiliates 192,842 impressions. The display layer
       hides them; the generator still invents them.

       So the assertion is that the two figures DIFFER, and that the scoped one
       equals the covering channels' own ratio -- not a guess about which way it
       moves. A test that encodes a direction nobody verified is a test that
       passes for the wrong reason the day the data changes. */
    const naive = (() => {
      const t = ALL_CHANNELS.reduce((a, c) => {
        const r = rowsFor(c, 30).reduce((x, d) => ({
          spend: x.spend + d.spend, clicks: x.clicks + d.clicks,
        }), { spend: 0, clicks: 0 });
        return { spend: a.spend + r.spend, clicks: a.clicks + r.clicks };
      }, { spend: 0, clicks: 0 });
      return t.spend / t.clicks;
    })();

    const scoped = blendedTotal('CPC', ALL_CHANNELS, 30);

    expect(scoped).toBeGreaterThan(0);
    expect(scoped).not.toBeCloseTo(naive, 3);
    /* And the scope really is narrower than "everything". */
    expect(coverageFor('CPC', ALL_CHANNELS).length).toBeLessThan(ALL_CHANNELS.length);
  });

  it('blended CPC equals spend over clicks for the covering channels only', () => {
    reset();
    const covering = coverageFor('CPC', ALL_CHANNELS);
    const t = covering.reduce((a, c) => {
      const r = rowsFor(c, 30).reduce((x, d) => ({
        spend: x.spend + d.spend, clicks: x.clicks + d.clicks,
      }), { spend: 0, clicks: 0 });
      return { spend: a.spend + r.spend, clicks: a.clicks + r.clicks };
    }, { spend: 0, clicks: 0 });
    expect(blendedTotal('CPC', ALL_CHANNELS, 30)).toBeCloseTo(t.spend / t.clicks, 8);
  });

  it('a period rate is not the mean of the daily rates', () => {
    reset();
    for (const m of ['CTR', 'CAC', 'CPC'] as const) {
      const daily = blendedValues(m, ALL_CHANNELS, 30).filter((v) => v > 0);
      const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
      expect(blendedTotal(m, ALL_CHANNELS, 30)).not.toBeCloseTo(mean, 6);
    }
  });
});

describe('a count blends to the true account total', () => {
  it('blended spend equals the all-channel total', () => {
    reset();
    for (const range of RANGES) {
      expect(blendedTotal('Spend', ALL_CHANNELS, range))
        .toBeCloseTo(totals('all', range).spend, 4);
    }
  });

  it('blended leads equals the all-channel total', () => {
    reset();
    expect(blendedTotal('Leads', ALL_CHANNELS, 30))
      .toBeCloseTo(totals('all', 30).leads, 4);
  });
});

describe('a single channel is just a blend of one', () => {
  it('scoping to one channel reproduces that channel’s own figures', () => {
    reset();
    /* Why Overview and the channel screens can share one code path. */
    for (const c of CHANNEL_KEYS) {
      const rows = rowsFor(c, 30);
      const sum = rows.reduce((a, r) => ({
        spend: a.spend + r.spend, impressions: a.impressions + r.impressions,
        clicks: a.clicks + r.clicks, leads: a.leads + r.leads,
        sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
      }), { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });
      for (const m of CHANNEL_METRICS[c]) {
        expect(blendedTotal(m, [c], 30)).toBeCloseTo(valueOf(m, sum), 6);
      }
      /* And never a caveat, because one channel always covers itself. */
      expect(coverageNote('CTR', [c])).toBeNull();
    }
  });
});

describe('the vocabulary adapts to what is switched on', () => {
  it('turning every click-reporting channel off removes CTR entirely', () => {
    /* Not "shows zero" -- removed. A CTR card reading 0.00% would be a claim
       that nothing was clicked, when the truth is nothing can be. */
    const onlyPodcasts = blendedMetrics(['podcasts']);
    expect(onlyPodcasts).not.toContain('CTR');
    expect(onlyPodcasts).not.toContain('Clicks');
    expect(onlyPodcasts).toContain('Impressions');
  });

  it('an empty account has no metrics rather than throwing', () => {
    expect(blendedMetrics([])).toEqual([]);
    expect(blendedTotal('Spend', [], 30)).toBe(0);
    expect(blendedDelta('Spend', [], 30)).toBe(0);
  });

  it('headline order is the funnel, and ends on the outcome metrics', () => {
    const meta = headlineKpis(CHANNEL_METRICS.meta);
    expect(meta[0]).toBe('Spend');
    /* ⚠️ The bug a naive "first N of the channel's list" cap would have shipped:
       CHANNEL_METRICS.meta is nine long and ends with CAC and ROAS, so slicing
       the first seven would drop both and keep CPM. */
    expect(meta).toContain('CAC');
    expect(meta).toContain('ROAS');
  });

  it('adapts per channel with no special cases', () => {
    /* Paid Search has no impressions; podcasts have no click. Both fall out of
       filtering one fixed order by availability. */
    expect(headlineKpis(CHANNEL_METRICS.paidSearch)).not.toContain('Impressions');
    expect(headlineKpis(CHANNEL_METRICS.podcasts)).not.toContain('Clicks');
    expect(headlineKpis(CHANNEL_METRICS.podcasts)).toContain('Impressions');
  });
});
