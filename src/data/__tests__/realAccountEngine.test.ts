// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyStructure } from '../structure';
import { decisions, leakOf } from '../decisions';
import { hydrate, TOTAL_POINTS, type DayRow } from '../metrics';
import { seededSource } from '../sources/seeded';
import type { SourceCampaign } from '../source';

/**
 * The two capabilities the seeded demo cannot show, on an account built to
 * have them: a cost that CREEPS (under the alert line every week), and spend
 * that MOVES (so the response curve is measured, not assumed).
 */
afterEach(() => {
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
  applyStructure(undefined);
  localStorage.clear();
});

const row = (spend: number, leads: number): DayRow =>
  ({ spend, impressions: spend * 80, clicks: leads * 20, leads, sales: leads / 10, revenue: spend * 3 });

function load(campaigns: SourceCampaign[]) {
  const sum = campaigns[0].rows.map((_, i) => campaigns.reduce((a, c) => {
    const r = c.rows[i];
    return { spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks,
      leads: a.leads + r.leads, sales: a.sales + r.sales, revenue: a.revenue + r.revenue };
  }, row(0, 0)));
  hydrate({ rows: { meta: sum }, periodEnd: '2026-09-28', currency: 'USD' });
  applyStructure(campaigns);
}

/* $1,000 a day; cost per lead flat at $40, then rising 6% a WEEK for the last 8. */
const creeping = Array.from({ length: TOTAL_POINTS }, (_, i) => {
  const weeksIntoLast8 = Math.floor((i - (TOTAL_POINTS - 56)) / 7);
  const cac = weeksIntoLast8 < 0 ? 40 : 40 * 1.06 ** weeksIntoLast8;
  return row(1000, 1000 / cac);
});
/* Spend swinging $300-$1,700 a day, leads ∝ spend^0.6. */
const swinging = Array.from({ length: TOTAL_POINTS }, (_, i) => {
  const spend = 1000 * (1 + 0.7 * Math.sin(i / 4));
  return row(spend, 0.6 * spend ** 0.6);
});
const camp = (id: string, name: string, rows: DayRow[]): SourceCampaign =>
  ({ id, name, channel: 'meta', stage: 'Active', objective: 'Conversions', rows });

describe('⭐ the slow leak -- what a week-over-week alert misses', () => {
  it('leakOf: 6% a week for 8 weeks is a leak; flat is not; one bad week is not', () => {
    const w = (cacs: number[]) => cacs.map((c) => ({ spend: 7000, leads: 7000 / c }));
    expect(leakOf(w([40, 42.4, 44.9, 47.6, 50.5, 53.5, 56.7, 60.1]))?.rise).toBeGreaterThan(0.15);
    expect(leakOf(w([40, 40, 40, 40, 40, 40, 40, 40]))).toBeNull();
    expect(leakOf(w([40, 40, 40, 40, 40, 40, 40, 70]))).toBeNull();      // one week, not a drift
  });

  it('a campaign creeping 6% a week -- no week ever alerts -- gets a cut, tier 1, tested for chance', () => {
    load([camp('m-creep', 'Creeping Campaign', creeping), camp('m-flat', 'Flat Campaign', Array.from({ length: TOTAL_POINTS }, () => row(800, 20)))]);
    const d = decisions(30, ['meta']).find((c) => c.kind === 'slow-leak');
    expect(d).toBeDefined();
    expect(d!.tier).toBe(1);
    expect(d!.action).toMatch(/^Cut the budget on “Creeping Campaign” 15% until a week comes in under \$/);
    expect(d!.because).toMatch(/No single week moved enough to raise an alert/);
    expect(d!.confidence?.level).not.toBe('low');
    expect(d!.effect!.spend).toBeLessThan(0);
    expect(decisions(30, ['meta']).some((c) => c.kind === 'slow-leak' && c.target.id === 'm-flat')).toBe(false);
  });
});

describe('⭐ where spend has moved, the curve is MEASURED and says so', () => {
  it('a raise on a campaign with swinging spend states its own measured curve', () => {
    load([camp('m-swing', 'Swinging Campaign', swinging), camp('m-dear', 'Dear Campaign', Array.from({ length: TOTAL_POINTS }, () => row(2000, 5)))]);
    const raises = decisions(30, ['meta']).filter((c) => /^Raise /.test(c.action) && c.target.id === 'm-swing');
    expect(raises.length).toBeGreaterThan(0);
    for (const c of raises) expect(c.expectation?.assuming).toMatch(/last \d+ days hold: each extra dollar has bought about (59|60|61)% as much/);
  });
});
