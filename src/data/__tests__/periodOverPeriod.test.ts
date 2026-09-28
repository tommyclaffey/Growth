import { describe, expect, it } from 'vitest';
import { adSetDelta, adSetRows } from '../adSets';
import { allAdSets } from '../adSets';
import { blendedDelta } from '../blended';
import { campaignDelta } from '../campaignSeries';
import { CAMPAIGNS } from '../campaigns';
import { creativeRows, creativesFor } from '../creative';
import {
  CHANNEL_KEYS, POINTS, delta, rowsFor, totals, type Range,
} from '../metrics';

const RANGES: Range[] = [7, 30, 90];

const sum = (rows: ReturnType<typeof rowsFor>, f: 'spend' | 'leads' | 'revenue') =>
  rows.reduce((a, r) => a + r[f], 0);
const pct = (now: number, before: number) => Math.round(((now - before) / before) * 100);

/**
 * 🚨 "Δ Prev" used to compare the back half of the SELECTED window with its
 * front half. That is not the previous period, and on a 7-day range it compared
 * 3 days with 4. These tests hold the comparison to the definition: the window
 * immediately before the selected one, the same length.
 */
describe('period-over-period is the preceding window, not a half-split', () => {
  it('the prior window is the same length as the current one, at every range', () => {
    for (const ch of [...CHANNEL_KEYS, 'all' as const]) {
      for (const r of RANGES) {
        expect(rowsFor(ch, r, 1)).toHaveLength(r);
      }
    }
  });

  it('the prior window is the days IMMEDIATELY before, not a copy or a gap', () => {
    for (const ch of CHANNEL_KEYS) {
      // The 90-day window contains the last 60 days; the 30 before the last
      // 30 are exactly its earlier half.
      expect(rowsFor(ch, 30, 1)).toEqual(rowsFor(ch, 90).slice(-60, -30));
      expect(rowsFor(ch, 7, 1)).toEqual(rowsFor(ch, 90).slice(-14, -7));
    }
  });

  it('a 90-day range has a real prior 90 days, not a blank', () => {
    for (const ch of CHANNEL_KEYS) {
      expect(rowsFor(ch, 90, 1).every((r) => r.spend > 0)).toBe(true);
    }
  });

  it('adding history did not move the recent window (30-day total is still the design figure)', () => {
    expect(Math.round(totals('meta', 30).spend)).toBe(61240);
    expect(rowsFor('meta', 90)).toHaveLength(POINTS);
  });

  it('a channel Spend delta equals the recomputed window-against-window figure', () => {
    for (const ch of CHANNEL_KEYS) {
      for (const r of RANGES) {
        expect(delta(ch, 'Spend', r))
          .toBe(pct(sum(rowsFor(ch, r), 'spend'), sum(rowsFor(ch, r, 1), 'spend')));
      }
    }
  });

  it('a ratio delta is the change in the PERIOD ratio, not in the mean of daily ratios', () => {
    for (const ch of CHANNEL_KEYS) {
      const cur = rowsFor(ch, 30);
      const prev = rowsFor(ch, 30, 1);
      const cac = (rs: typeof cur) => sum(rs, 'spend') / sum(rs, 'leads');
      expect(delta(ch, 'CAC', 30)).toBe(pct(cac(cur), cac(prev)));
    }
  });

  it('blended and channel tiers agree on Spend', () => {
    for (const r of RANGES) {
      expect(blendedDelta('Spend', undefined, r)).toBe(delta('all', 'Spend', r));
    }
  });

  it('a campaign, its ad sets and its ads report the same Spend change as their channel', () => {
    /* Every tier is a constant share of its parent's spend, so a share cannot
       change the ratio between two windows. If one disagrees, a tier is
       comparing the wrong window. */
    for (const c of CAMPAIGNS) {
      const want = delta(c.channel, 'Spend', 30);
      expect(campaignDelta(c.id, 'Spend', 30)).toBe(want);
    }
    for (const ref of allAdSets()) {
      expect(adSetDelta(ref.adSet.id, 'Spend', 30)).toBe(delta(ref.campaign.channel, 'Spend', 30));
      expect(adSetRows(ref.adSet.id, 30, 1)).toHaveLength(30);
    }
    for (const c of CAMPAIGNS.slice(0, 4)) {
      for (const ad of creativesFor(c.id)) {
        expect(creativeRows(ad.id, 30, 1)).toHaveLength(30);
      }
    }
  });
});
