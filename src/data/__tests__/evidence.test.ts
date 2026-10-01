import { describe, expect, it } from 'vitest';
import { DEFAULT_ELASTICITY, normalCdf, projectRaise, rateTest, responseCurve } from '../evidence';
import type { DayRow } from '../metrics';

const day = (spend: number, leads: number): DayRow =>
  ({ spend, leads, impressions: 0, clicks: 0, sales: 0, revenue: 0 } as DayRow);

describe('normalCdf', () => {
  it('matches the table', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.645)).toBeCloseTo(0.05, 3);
  });
});

describe('rateTest -- "is that real, or noise?"', () => {
  it('the same cost per lead on both sides is not a finding', () => {
    const c = rateTest({ spend: 1000, leads: 25 }, { spend: 4000, leads: 100 });
    expect(c.p).toBeGreaterThan(0.9);
    expect(c.level).toBe('low');
  });

  it('a big gap on plenty of leads is high confidence', () => {
    const c = rateTest({ spend: 5000, leads: 50 }, { spend: 5000, leads: 120 });
    expect(c.level).toBe('high');
    expect(c.p).toBeLessThan(0.01);
    expect(c.sentence).toMatch(/170 leads behind it/);
  });

  it('⭐ the SAME gap on a handful of leads is not', () => {
    /* $100 vs $40 a lead -- dramatic -- on 7 leads. A coin landing heads three times. */
    const c = rateTest({ spend: 200, leads: 2 }, { spend: 200, leads: 5 });
    expect(c.level).toBe('low');
    expect(c.sentence).toMatch(/Not enough to act on yet/);
  });

  it('no spend or no leads is low, never a crash', () => {
    expect(rateTest({ spend: 0, leads: 0 }, { spend: 100, leads: 3 }).level).toBe('low');
    expect(rateTest({ spend: 100, leads: 0 }, { spend: 100, leads: 0 }).level).toBe('low');
  });

  it('is symmetric -- which side is "the subject" does not change the answer', () => {
    const a = { spend: 3000, leads: 40 }; const b = { spend: 2000, leads: 45 };
    expect(rateTest(a, b).p).toBeCloseTo(rateTest(b, a).p, 10);
  });
});

describe('responseCurve -- "what does the NEXT dollar buy?"', () => {
  it('recovers a known elasticity from history where spend actually moved', () => {
    const rows = Array.from({ length: 90 }, (_, i) => {
      const spend = 500 * (1 + 0.8 * Math.sin(i / 5));            // spend swings 100..900
      return day(spend, 3 * spend ** 0.6);                         // leads ∝ spend^0.6
    });
    const c = responseCurve(rows);
    expect(c.measured).toBe(true);
    expect(c.b).toBeCloseTo(0.6, 1);
  });

  it('⚠️ flat spend teaches nothing -- it says so and uses the stated default', () => {
    const rows = Array.from({ length: 90 }, (_, i) => day(1000 + (i % 3), 25 + (i % 5)));
    const c = responseCurve(rows);
    expect(c.measured).toBe(false);
    expect(c.b).toBe(DEFAULT_ELASTICITY);
  });

  it('too few days is the default too', () => {
    expect(responseCurve([day(100, 2), day(900, 9)]).measured).toBe(false);
  });

  it('is clamped: never more than 1 (free money) or less than 0.2', () => {
    const steep = Array.from({ length: 60 }, (_, i) => { const s = 100 + i * 20; return day(s, 0.0001 * s ** 2); });
    expect(responseCurve(steep).b).toBeLessThanOrEqual(1);
  });
});

describe('projectRaise', () => {
  it('on a straight line, the marginal price IS the average', () => {
    const p = projectRaise({ spend: 1000, leads: 25 }, 0.2, { b: 1, measured: true, days: 90, r2: 1 });
    expect(p.extraLeads).toBeCloseTo(5, 6);
    expect(p.marginalCac).toBeCloseTo(40, 6);
  });

  it('⭐ on a bending curve, the extra money pays MORE than the average', () => {
    const p = projectRaise({ spend: 1000, leads: 25 }, 0.2, { b: 0.8, measured: false, days: 0, r2: 0 });
    expect(p.marginalCac).toBeGreaterThan(40 / 0.8 * 0.99);         // ~avg / b
    expect(p.extraLeads).toBeLessThan(5);
  });
});
