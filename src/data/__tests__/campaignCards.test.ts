import { describe, expect, it } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import { campaignDelta, campaignSparkline, campaignTotals, campaignValues } from '../campaignSeries';
import { kpisFor, valueOf } from '../channelMetrics';
import { deltaOf, type Range } from '../metrics';

const RANGES: Range[] = [7, 30, 90];

/**
 * The consistency guarantee: every KPI card on every campaign page, at every
 * range, carries the same marks. Three channels run a single campaign
 * (YouTube, Podcasts, Affiliates) and used to render a label, a number and
 * nothing else, because the only footer content those cards had was a
 * benchmark that needs a peer.
 */
describe('every campaign card is fully populated', () => {
  for (const c of CAMPAIGNS) {
    it(`${c.name} — all metrics, all ranges`, () => {
      const shown = kpisFor(c.channel, c.objective);
      expect(shown.length).toBeGreaterThan(0);

      for (const range of RANGES) {
        for (const m of shown) {
          const d = campaignDelta(c.id, m, range);
          expect(Number.isFinite(d), `${m} delta at ${range}d`).toBe(true);

          const spark = campaignSparkline(c.id, m, range);
          expect(spark.length, `${m} spark at ${range}d`).toBe(7);
          expect(spark.every(Number.isFinite), `${m} spark values`).toBe(true);

          /* Rates must never divide by zero into NaN or Infinity — a day with
             no impressions is a real day. */
          expect(Number.isFinite(valueOf(m, campaignTotals(c.id, range)))).toBe(true);
        }
      }
    });
  }

  it('uses ONE definition of period-over-period, not a campaign copy of it', () => {
    const c = CAMPAIGNS[0];
    expect(campaignDelta(c.id, 'Spend', 30))
      .toBe(deltaOf(campaignValues(c.id, 'Spend', 30)));
  });

  it('samples to the END of the series, so the mark ends where the number does', () => {
    const c = CAMPAIGNS[0];
    const vals = campaignValues(c.id, 'Spend', 30);
    expect(campaignSparkline(c.id, 'Spend', 30).at(-1)).toBe(vals.at(-1));
  });
});
