// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { decisions, heldBack } from '../decisions';
import { planFrom } from '../plan';
import { ALL_CHANNELS } from '../blended';
import { totals } from '../metrics';

afterEach(() => localStorage.clear());
const found = (r = 30) => decisions(r as never, ALL_CHANNELS);

describe('⭐ the plan is the cards, added up', () => {
  it('its totals are exactly the sum of its moves’ effects', () => {
    const p = planFrom(found(), 30, ALL_CHANNELS);
    const spend = p.moves.reduce((a, c) => a + c.effect!.spend, 0);
    const leads = p.moves.reduce((a, c) => a + c.effect!.leads, 0);
    expect(p.added - p.freed).toBeCloseTo(spend, 6);
    expect(p.leadsGained - p.leadsLost).toBeCloseTo(leads, 6);
    expect(p.after.spend - p.before.spend).toBeCloseTo(spend, 6);
  });

  it('"before" is the account’s own week -- the window, scaled to 7 days', () => {
    const p = planFrom(found(), 30, ALL_CHANNELS);
    const spend = ALL_CHANNELS.reduce((a, ch) => a + totals(ch, 30).spend, 0);
    expect(p.before.spend).toBeCloseTo((spend / 30) * 7, 6);
  });

  it('questions and held-back findings are never in it', () => {
    const p = planFrom([...found(), ...heldBack(30, ALL_CHANNELS)], 30, ALL_CHANNELS);
    for (const c of [...p.moves, ...p.also]) {
      expect(c.tier, c.action).not.toBe(3);
      expect(c.held, c.action).toBeUndefined();
    }
  });

  it('moves with no money in them are listed as "also", not summed', () => {
    const p = planFrom(found(), 30, ALL_CHANNELS);
    expect(p.also.some((c) => c.kind === 'no-variant')).toBe(true);
    expect(p.also.some((c) => c.kind === 'holdout-test')).toBe(true);
    for (const c of p.also) expect(c.effect === undefined || (c.effect.spend === 0 && c.effect.leads === 0)).toBe(true);
  });

  it('⭐ on the demo: fewer dollars, more leads, a lower cost per lead', () => {
    const p = planFrom(found(), 30, ALL_CHANNELS);
    expect(p.after.spend).toBeLessThan(p.before.spend);
    expect(p.after.leads).toBeGreaterThan(p.before.leads);
    expect(p.after.cac).toBeLessThan(p.before.cac);
    expect(p.assumed).toBe(true);                // demo spend is too flat to measure
  });

  it('every pause / end / cut costs leads; every raise / turn-on buys them', () => {
    for (const c of found()) {
      if (!c.effect) continue;
      if (/^(Pause|End|Cut) /.test(c.action)) { expect(c.effect.spend, c.action).toBeLessThan(0); expect(c.effect.leads, c.action).toBeLessThanOrEqual(0); }
      if (/^(Raise|Put|Turn) /.test(c.action)) { expect(c.effect.spend, c.action).toBeGreaterThan(0); expect(c.effect.leads, c.action).toBeGreaterThan(0); }
    }
  });
});
