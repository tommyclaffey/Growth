// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { decisions, heldBack, validate } from '../decisions';
import { ALL_CHANNELS } from '../blended';

afterEach(() => localStorage.clear());

const shown = (r = 30) => decisions(r as never, ALL_CHANNELS);
const held = (r = 30) => heldBack(r as never, ALL_CHANNELS);

describe('⭐ every comparison is tested for chance before it is advice', () => {
  it('every shown claim that compares two things carries its confidence, and it is not low', () => {
    for (const r of [7, 30, 90]) {
      for (const c of shown(r)) {
        if (!c.compare) continue;
        expect(c.confidence, c.action).toBeDefined();
        if (c.tier !== 3) expect(c.confidence!.level, c.action).not.toBe('low');
      }
    }
  });

  it('structural findings make no statistical claim', () => {
    for (const c of shown().filter((x) => x.kind === 'no-variant' || x.kind === 'concentration-risk')) {
      expect(c.compare, c.action).toBeUndefined();
      expect(c.confidence, c.action).toBeUndefined();
    }
  });

  it('⭐ a week of data is not enough to END a campaign -- held back, and says why', () => {
    /* 30 days: 214 leads, the gap is real. 7 days: 50 leads, a 1-in-3 coin flip. */
    expect(shown(30).some((c) => c.id === 'review:c8')).toBe(true);
    const h = held(7).find((c) => c.id === 'review:c8');
    expect(h?.held?.reason).toBe('chance');
    expect(h?.held?.sentence).toMatch(/Not enough to act on yet/);
    expect(shown(7).some((c) => c.id === 'review:c8')).toBe(false);
  });

  it('a held finding is never also shown', () => {
    for (const r of [7, 30, 90]) {
      const ids = new Set(shown(r).map((c) => c.id));
      for (const h of held(r)) expect(ids.has(h.id), h.action).toBe(false);
    }
  });

  it('tier 3 questions are never held -- nobody acts on a question', () => {
    for (const r of [7, 30, 90]) expect(held(r).some((c) => c.tier === 3)).toBe(false);
  });
});

describe('⭐ every raise is priced at the MARGIN, and sized to stay worth it', () => {
  it('every raise names what the extra money pays, next to the average', () => {
    for (const c of shown().filter((x) => /^Raise |^Put \$/.test(x.action))) {
      expect(c.expectation?.outcome, c.action).toMatch(/each for the extra money \(today’s average: \$/);
    }
  });

  it('the assumption says whether the curve was measured or assumed', () => {
    for (const c of shown().filter((x) => /^Raise |^Put \$/.test(x.action))) {
      expect(c.expectation?.assuming, c.action).toMatch(/Assumed, not measured|last \d+ days hold/);
    }
  });

  it('⭐ Branded Search beats Paid Search on AVERAGE -- but its next dollar would not, so no raise', () => {
    const h = held().find((c) => c.id === 'beats-channel:c7');
    expect(h?.held?.reason).toBe('marginal');
    expect(h?.held?.sentence).toMatch(/above the Paid Search average of \$85\.98/);
    expect(shown().some((c) => c.id === 'beats-channel:c7')).toBe(false);
  });

  it('⭐ under plan with nowhere good to put it: the decision is to lower the plan', () => {
    const p = shown().find((c) => c.kind === 'pacing')!;
    expect(p.action).toBe('Lower the 30-day plan to $160,780');
    expect(p.because).toMatch(/next dollar would buy leads at about \$/);
    expect(p.tier).toBe(2);                         // rests on the curve -- stated
    expect(validate(p)).toBeNull();
  });

  it('raise sizes come in 5% steps, never more than the detector allows', () => {
    for (const c of shown().filter((x) => /^Raise /.test(x.action))) {
      const m = c.action.match(/ (\d+)%/);
      expect(m, c.action).toBeTruthy();
      expect(Number(m![1]) % 5).toBe(0);
      expect(Number(m![1])).toBeLessThanOrEqual(25);
    }
  });
});
