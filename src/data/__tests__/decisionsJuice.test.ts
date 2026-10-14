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

  /* Oct 12: with 23 campaigns there IS somewhere good to put it, so the demo's
     pacing card now moves money instead of lowering the plan. The next test
     forces the lower-the-plan branch. */
  it('⭐ under plan: unspent budget goes where a lead costs less than the average', () => {
    const p = shown().find((c) => c.kind === 'pacing')!;
    expect(p.action).toMatch(/^Put \$[\d,]+ of the unspent budget into “.+”$/);
    expect(p.because).toMatch(/under plan: \$286,180 of \$445,000 for 30 days/);
    expect(p.tier).toBe(2);                         // rests on the curve -- stated
    expect(validate(p)).toBeNull();
  });

  it('⭐ under plan with nowhere good to put it: the decision is to lower the plan', async () => {
    const { setStage } = await import('../campaignStatus');
    const { CAMPAIGNS } = await import('../campaigns');
    /* Only the podcast host reads keep running: dearer per lead than the
       account average, so no campaign is a good home for the unspent budget. */
    const before = CAMPAIGNS.map((c) => [c.id, c.stage] as const);
    for (const c of CAMPAIGNS) if (c.id !== 'c22') setStage(c.id, 'Paused');
    try {
      const p = shown().find((c) => c.kind === 'pacing')!;
      expect(p.action).toMatch(/^Lower the 30-day plan to \$[\d,]+$/);
      expect(validate(p)).toBeNull();
    } finally {
      for (const [id, st] of before) setStage(id, st);
    }
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

describe('⭐ ad-level moves come three at a time (Oct 12)', () => {
  it('shows at most three of each kind; the rest wait in Held back, saying why', () => {
    for (const kind of ['spend-return-mismatch', 'scale-winner', 'paused-winner']) {
      expect(shown().filter((c) => c.kind === kind).length, kind).toBeLessThanOrEqual(3);
    }
    const queued = held().filter((c) => c.held?.reason === 'queue');
    expect(queued.length).toBeGreaterThan(0);
    for (const c of queued) expect(c.held!.sentence).toMatch(/^One of \d+ .+ this week\. The 3 strongest are proposed first/);
  });
});
