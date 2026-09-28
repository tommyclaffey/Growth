import { describe, it, expect } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import { adSetById, adSetRows, adSetSeries, adSetShare, adSetTotals, allAdSets } from '../adSets';
import { campaignRows, campaignTotals } from '../campaignSeries';
import { creativesFor } from '../creative';
import { CHANNEL_DEPTH } from '../channelDepth';
import { CHANNEL_KEYS, RANGES, setActiveChannels } from '../metrics';

const reset = () => setActiveChannels([...CHANNEL_KEYS]);

describe('ad sets reconcile with their campaign', () => {
  it('a campaign’s ad sets sum to that campaign EVERY DAY, not just in total', () => {
    reset();
    /* The invariant the whole tier rests on. The tier was added precisely
       because it had no numbers; numbers that do not add up to the row above
       would have been worse than none. */
    for (const c of CAMPAIGNS) {
      for (const range of RANGES) {
        const parent = campaignRows(c.id, range);
        const parts = c.adSets.map((a) => adSetRows(a.id, range));
        parent.forEach((row, d) => {
          const spend = parts.reduce((x, p) => x + p[d].spend, 0);
          const leads = parts.reduce((x, p) => x + p[d].leads, 0);
          expect(spend).toBeCloseTo(row.spend, 6);
          expect(leads).toBeCloseTo(row.leads, 6);
        });
      }
    }
  });

  it('shares within a campaign sum to exactly one', () => {
    reset();
    for (const c of CAMPAIGNS) {
      const sum = c.adSets.reduce((a, x) => a + adSetShare(x.id), 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });

  it('period totals sum to the campaign’s period totals', () => {
    reset();
    for (const c of CAMPAIGNS) {
      for (const range of RANGES) {
        const summed = c.adSets.reduce((a, x) => a + adSetTotals(x.id, range).spend, 0);
        expect(summed).toBeCloseTo(campaignTotals(c.id, range).spend, 6);
      }
    }
  });
});

describe('ad sets follow the date range', () => {
  it('spend differs between 7, 30 and 90 days', () => {
    reset();
    /* The defect this tier shipped with: the rows sat still while every other
       number on the page moved, and the page apologised for it in a caption.
       A test now fails if that regresses. */
    for (const { adSet } of allAdSets()) {
      const seen = RANGES.map((r) => adSetTotals(adSet.id, r).spend);
      const unique = new Set(seen.map((v) => v.toFixed(4)));
      expect(unique.size).toBe(RANGES.length);
    }
  });

  it('a series has one point per day of the selected range', () => {
    reset();
    const { adSet } = allAdSets()[0];
    for (const range of RANGES) {
      expect(adSetSeries(adSet.id, 'Spend', range)).toHaveLength(range);
    }
  });

  it('every series point carries a label', () => {
    reset();
    /* The labels are borrowed from the campaign's series rather than re-sliced.
       An empty string here would mean that borrowing broke silently and the
       axis went blank. */
    const { adSet } = allAdSets()[0];
    for (const p of adSetSeries(adSet.id, 'Spend', 30)) {
      expect(p.label).not.toBe('');
    }
  });
});

describe('ratios are divided once, not averaged', () => {
  it('CAC equals total spend over total leads', () => {
    reset();
    for (const { adSet } of allAdSets()) {
      const t = adSetTotals(adSet.id, 30);
      if (t.leads <= 0) continue;
      expect(t.cac).toBeCloseTo(t.spend / t.leads, 8);
      /* NOT the mean of each day's CAC -- a different number, and the one a
         reader gets by adding the column up is this one. */
      const daily = adSetRows(adSet.id, 30)
        .filter((r) => r.leads > 0)
        .map((r) => r.spend / r.leads);
      const mean = daily.reduce((a, b) => a + b, 0) / daily.length;
      expect(t.cac).not.toBeCloseTo(mean, 6);
    }
  });
});

describe('lookup and identity', () => {
  it('finds every ad set and names its campaign', () => {
    for (const c of CAMPAIGNS) {
      for (const a of c.adSets) {
        const ref = adSetById(a.id);
        expect(ref?.campaign.id).toBe(c.id);
        expect(ref?.adSet.name).toBe(a.name);
      }
    }
  });

  it('an unknown id resolves to nothing rather than throwing', () => {
    expect(adSetById('nope')).toBeUndefined();
    expect(adSetShare('nope')).toBe(0);
    expect(adSetRows('nope')).toEqual([]);
    expect(adSetSeries('nope', 'Spend')).toEqual([]);
  });

  it('every ad has an ad set that exists', () => {
    /* The chain has to be walkable in both directions. An ad pointing at an
       ad-set id with no record would render a page with no parent. */
    for (const c of CAMPAIGNS) {
      for (const ad of creativesFor(c.id)) {
        expect(adSetById(ad.adSetId)).toBeDefined();
      }
    }
  });
});

describe('channel vocabulary', () => {
  it('every channel names its own tiers', () => {
    for (const k of CHANNEL_KEYS) {
      const d = CHANNEL_DEPTH[k];
      expect(d.group.one.length).toBeGreaterThan(0);
      expect(d.group.many.length).toBeGreaterThan(0);
      expect(d.leaf.one.length).toBeGreaterThan(0);
      expect(d.leaf.many.length).toBeGreaterThan(0);
    }
  });

  it('does not call every channel’s middle tier an ad set', () => {
    /* The point of the table. If this ever collapses back to one word for all
       six, the table has stopped earning its place. */
    const groups = new Set(CHANNEL_KEYS.map((k) => CHANNEL_DEPTH[k].group.one));
    expect(groups.size).toBeGreaterThan(1);
    expect(CHANNEL_DEPTH.podcasts.group.one).not.toBe(CHANNEL_DEPTH.meta.group.one);
    expect(CHANNEL_DEPTH.affiliates.group.one).not.toBe(CHANNEL_DEPTH.meta.group.one);
  });
});
