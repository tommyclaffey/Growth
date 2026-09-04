import { describe, it, expect } from 'vitest';
import {
  CHANNEL_KEYS, METRICS, RANGES, activeChannels, setActiveChannels,
  series, totals, sparkline, delta, higherIsBetter, deltaTone,
} from '../metrics';

/**
 * These assert INVARIANTS, not snapshots.
 *
 * A snapshot of the seeded numbers would pass forever and catch nothing except
 * a change to the seed. What is worth protecting is the set of properties the
 * dashboard's correctness actually rests on -- most of which have already been
 * violated at least once in this repo's history.
 */

const ALL = [...CHANNEL_KEYS];
const reset = () => setActiveChannels(ALL);

describe('ratios are computed, never summed', () => {
  it('blended CAC equals total spend over total leads', () => {
    reset();
    for (const range of RANGES) {
      const t = totals('all', range);
      /* The bug this guards: averaging six channels' CAC weights a $510/day
         podcast the same as $2,551/day on Meta, and reports a blended CAC no
         money was ever spent at. */
      expect(t.cac).toBeCloseTo(t.spend / t.leads, 6);
      expect(t.roas).toBeCloseTo(t.revenue / t.spend, 6);
    }
  });

  it('blended CAC is not the mean of the channels', () => {
    reset();
    const mean = ALL.reduce((a, k) => a + totals(k, 30).cac, 0) / ALL.length;
    expect(totals('all', 30).cac).not.toBeCloseTo(mean, 2);
  });
});

describe('the blend is the sum of its parts', () => {
  it('total spend equals the channels added up', () => {
    reset();
    const summed = ALL.reduce((a, k) => a + totals(k, 30).spend, 0);
    expect(totals('all', 30).spend).toBeCloseTo(summed, 6);
  });

  it('deactivating a channel removes it from the blend', () => {
    reset();
    const before = totals('all', 30).spend;
    const podcasts = totals('podcasts', 30).spend;
    setActiveChannels(ALL.filter((k) => k !== 'podcasts'));
    expect(totals('all', 30).spend).toBeCloseTo(before - podcasts, 6);
    reset();
  });

  it('an empty channel set reads as zero, never NaN', () => {
    /* setChannels() used to force all six back on rather than allow this. */
    setActiveChannels([]);
    expect(activeChannels()).toHaveLength(0);
    for (const m of METRICS) {
      for (const p of series('all', m, 30)) expect(Number.isFinite(p.value)).toBe(true);
    }
    const t = totals('all', 30);
    expect(t.cac).toBe(0);
    expect(t.roas).toBe(0);
    reset();
  });
});

describe('series shape', () => {
  it('returns exactly the number of days asked for', () => {
    reset();
    expect(series('all', 'Spend', 7)).toHaveLength(7);
    expect(series('all', 'Spend', 30)).toHaveLength(30);
    expect(series('all', 'Spend', 90)).toHaveLength(90);
  });

  it('every metric is finite for every scope and range', () => {
    reset();
    for (const scope of ['all', ...ALL] as const) {
      for (const m of METRICS) {
        for (const r of RANGES) {
          for (const p of series(scope, m, r)) {
            expect(Number.isFinite(p.value)).toBe(true);
          }
        }
      }
    }
  });
});

describe('sparkline covers the whole window', () => {
  it('samples the last day, not merely near it', () => {
    reset();
    /* At 90 days the old sampler stopped at index 72 -- the most recent 17
       days were invisible while the delta badge beside it used all 90. */
    for (const r of RANGES) {
      const full = series('all', 'Spend', r).map((d) => d.value);
      const marks = sparkline('all', 'Spend', r);
      expect(marks[marks.length - 1]).toBe(full[full.length - 1]);
      expect(marks[0]).toBe(full[0]);
    }
  });

  it('returns the requested number of points', () => {
    reset();
    for (const r of RANGES) expect(sparkline('all', 'Spend', r)).toHaveLength(7);
  });
});

describe('direction and verdict', () => {
  it('treats CAC as the one metric where a rise is bad', () => {
    expect(higherIsBetter('CAC')).toBe(false);
    for (const m of METRICS.filter((x) => x !== 'CAC')) {
      expect(higherIsBetter(m)).toBe(true);
    }
    /* Undefined is answered here so call sites cannot each pick a default. */
    expect(higherIsBetter(undefined)).toBe(true);
  });

  it('reads a rising cost as bad and a falling one as good', () => {
    expect(deltaTone(5, higherIsBetter('CAC'))).toBe('bad');
    expect(deltaTone(-5, higherIsBetter('CAC'))).toBe('good');
    expect(deltaTone(5, higherIsBetter('ROAS'))).toBe('good');
    expect(deltaTone(-5, higherIsBetter('ROAS'))).toBe('bad');
  });

  it('treats zero as flat, not as a direction', () => {
    /* `percent >= 0` once folded 0 in with "up", so an unchanged metric got a
       verdict: blended CAC read "up 0%" in red beside ROAS "up 0%" in green. */
    expect(deltaTone(0, true)).toBe('flat');
    expect(deltaTone(0, false)).toBe('flat');
  });

  it('produces a finite delta for every combination', () => {
    reset();
    for (const scope of ['all', ...ALL] as const) {
      for (const m of METRICS) {
        for (const r of RANGES) expect(Number.isFinite(delta(scope, m, r))).toBe(true);
      }
    }
  });
});
