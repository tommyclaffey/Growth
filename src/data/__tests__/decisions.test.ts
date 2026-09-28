import { describe, it, expect } from 'vitest';
import { decisions, decisionsByTier, validate, type Candidate } from '../decisions';
import { ALL_CHANNELS } from '../blended';
import { CHANNEL_KEYS, RANGES, setActiveChannels } from '../metrics';

const reset = () => setActiveChannels([...CHANNEL_KEYS]);
const all = (range: 7 | 30 | 90 = 30) => decisions(range, ALL_CHANNELS);

describe('the engine produces findings at all', () => {
  it('finds candidates from the seeded data', () => {
    reset();
    expect(all().length).toBeGreaterThan(0);
  });

  it('every candidate survives its own validator', () => {
    reset();
    for (const range of RANGES) {
      for (const c of all(range)) expect(validate(c)).toBeNull();
    }
  });

  it('ids are unique, so the same finding cannot appear twice', () => {
    reset();
    const ids = all().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is stable — the same inputs give the same order', () => {
    reset();
    expect(all().map((c) => c.id)).toEqual(all().map((c) => c.id));
  });

  it('an empty account produces nothing rather than throwing', () => {
    expect(decisions(30, [])).toEqual([]);
  });
});

describe('🚨 the tier contract — the load-bearing claim', () => {
  it('every tier 2 candidate states its assumption', () => {
    reset();
    for (const range of RANGES) {
      const t2 = all(range).filter((c) => c.tier === 2);
      for (const c of t2) {
        /* A projection whose assumption is invisible is a guess wearing a
           fact's clothes. This is the whole difference between tier 1 and 2. */
        expect(c.expectation?.assuming, c.id).toBeTruthy();
      }
    }
  });

  it('no tier 1 candidate smuggles in an assumption', () => {
    reset();
    for (const c of all().filter((x) => x.tier === 1)) {
      expect(c.expectation?.assuming, c.id).toBeUndefined();
    }
  });

  it('every tier 3 candidate refuses to promise an outcome', () => {
    reset();
    const t3 = all().filter((c) => c.tier === 3);
    expect(t3.length).toBeGreaterThan(0);
    for (const c of t3) {
      /* A question cannot have an expected result. Giving it one would make it
         look like advice, which is exactly what it must not be. */
      expect(c.expectation, c.id).toBeUndefined();
      expect(c.needs, c.id).toBeTruthy();
    }
  });

  it('no tier 3 candidate carries a dollar figure', () => {
    reset();
    /* ⚠️ The mechanism of the trap. atStake on a causal question is how the
       least supportable finding climbs a list sorted by money. */
    for (const c of all().filter((x) => x.tier === 3)) {
      expect(c.atStake, c.id).toBeUndefined();
    }
  });

  it('the validator actually rejects each violation', () => {
    /* The guard has to fail on bad input, or it is decoration. */
    const base: Candidate = {
      id: 'x', tier: 1, kind: 'pacing', action: 'a', because: 'b',
      evidence: [], target: { kind: 'account', id: 'a', label: 'A' }, strength: 0.5,
    };
    expect(validate({ ...base, tier: 2, expectation: { outcome: 'o', checkOn: '2026-10-27' } }))
      .toMatch(/no stated assumption/);
    expect(validate({ ...base, tier: 1, expectation: { outcome: 'o', assuming: 'x', checkOn: '2026-10-27' } }))
      .toMatch(/should be tier 2/);
    expect(validate({ ...base, tier: 3, needs: 'n', expectation: { outcome: 'o', checkOn: '2026-10-27' } }))
      .toMatch(/cannot promise an outcome/);
    expect(validate({ ...base, tier: 3 })).toMatch(/does not say what would answer it/);
    expect(validate({ ...base, tier: 3, needs: 'n', atStake: 100 })).toMatch(/atStake/);
  });
});

describe('🚨 the podcast trap', () => {
  it('surfaces the cross-channel cost gap as a QUESTION, never as advice', () => {
    reset();
    const gap = all().find((c) => c.kind === 'cross-channel-cost-gap');
    expect(gap).toBeDefined();
    expect(gap!.tier).toBe(3);

    /* ⚠️ The assertion is scoped to the ACTION, not to the whole card.

       The first version searched `action` + `because` together for imperatives
       and failed -- because `because` deliberately SAYS "the obvious read is to
       cut it, but this dashboard measures last touch". Naming the trap is the
       point of the copy; forbidding the word "cut" anywhere would have forced
       the card to stop explaining itself. The action is what a user might act
       on, so the action is what must not command. */
    expect(gap!.action.toLowerCase()).not.toMatch(/\b(cut|pause|stop|reduce|kill|drop)\b/);
    /* And it has to read as a question. */
    expect(gap!.action.trim().endsWith('?')).toBe(true);

    /* If the copy raises the obvious read, it must refute it in the same breath
       rather than leaving it hanging as the last thing read. */
    const why = gap!.because.toLowerCase();
    if (/\bcut\b/.test(why)) expect(why).toMatch(/\bbut\b|last touch/);
  });

  it('names what would actually answer it', () => {
    reset();
    const gap = all().find((c) => c.kind === 'cross-channel-cost-gap')!;
    expect(gap.needs).toMatch(/incrementality|promo code/i);
    /* And admits the limitation by name rather than implying it. */
    expect(gap.needs).toMatch(/attribution/i);
  });

  it('the finding with the most money behind it is NOT ranked first', () => {
    reset();
    /* ⭐ The single assertion this whole design exists to make true.

       The cross-channel gap carries a whole channel's budget. A list ranked by
       impact would put it at position 1, and it is the one finding the data
       cannot support. */
    const ranked = all();
    const gapIndex = ranked.findIndex((c) => c.kind === 'cross-channel-cost-gap');
    expect(gapIndex).toBeGreaterThan(0);
    /* Every tier 1 and 2 finding outranks it. */
    expect(ranked.slice(0, gapIndex).every((c) => c.tier < 3)).toBe(true);
  });
});

describe('ranking is by support, not by size', () => {
  it('tiers never interleave', () => {
    reset();
    const tiers = all().map((c) => c.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
  });

  it('within a tier, order is by strength — the declared sort key', () => {
    reset();
    /* The actual contract. The first version of this test looked for an
       atStake "inversion" and found none, which proved nothing either way:
       most candidates carry no dollar figure at all, so a list with no
       inversions is not evidence of money-sorting. Assert the real key. */
    for (const tier of [1, 2, 3] as const) {
      const inTier = all().filter((c) => c.tier === tier).map((c) => c.strength);
      const sorted = [...inTier].sort((a, b) => b - a);
      expect(inTier).toEqual(sorted);
    }
  });

  it('atStake is not the comparator', () => {
    reset();
    /* Stated as a property of the code rather than of today's data: the biggest
       dollar figure the engine can produce belongs to the tier-3 question, and
       that one is pinned below every tier 1 and 2 finding by the tier sort. The
       "gap is not first" test above is the live assertion; this one guards the
       reason -- a causal finding may never carry money at all. */
    for (const c of all()) {
      if (c.tier === 3) expect(c.atStake).toBeUndefined();
    }
  });

  it('decisionsByTier partitions without losing or duplicating anything', () => {
    reset();
    const grouped = decisionsByTier(30, ALL_CHANNELS);
    const total = grouped[1].length + grouped[2].length + grouped[3].length;
    expect(total).toBe(all().length);
  });
});

describe('the findings are about real things', () => {
  it('every candidate carries evidence', () => {
    reset();
    for (const c of all()) {
      expect(c.evidence.length, c.id).toBeGreaterThan(0);
      for (const e of c.evidence) {
        expect(e.label).toBeTruthy();
        expect(e.value).toBeTruthy();
      }
    }
  });

  it('a check-on date is a real future date, not a phrase', () => {
    reset();
    for (const c of all()) {
      if (!c.expectation) continue;
      expect(c.expectation.checkOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(c.expectation.checkOn).getTime()).toBeGreaterThan(Date.now() - 86400000);
    }
  });

  it('any pause recommendation names a running ad, and reads as a pause', () => {
    reset();
    /* ⚠️ This asserts CORRECTNESS, not presence — and the reason is a real
       finding, logged as G-013.

       The mismatch detector currently returns NOTHING, and it is right to.
       `creative.ts` assigns an ad its spend AND its leads by the SAME share of
       its ad set, so every ad inside a campaign has an identical CAC by
       construction. `c1a-cr1` and `c1a-cr3` both come out at $34.31. There is
       no underperforming ad to find because ad-level performance variation does
       not exist in this data.

       Asserting `length > 0` here would have been a test demanding the engine
       invent a finding. The honest assertion is that whatever it finds is
       well-formed — and G-013 is the ticket that makes the data able to
       exercise it. */
    const pauses = all().filter((c) => c.kind === 'spend-return-mismatch');
    for (const c of pauses) {
      expect(c.action).toMatch(/^Pause /);
      expect(c.target.kind).toBe('ad');
      expect(c.tier).toBe(1);
    }
  });

  it('reallocation stays inside one channel', () => {
    reset();
    /* ⭐ The distinction that makes reallocation tier 2 instead of tier 3: two
       campaigns on one channel are measured the same way by the same platform.
       Across channels it becomes the podcast trap. */
    for (const c of all().filter((x) => x.kind === 'reallocate-within-channel')) {
      expect(c.channel).toBeDefined();
      expect(c.because).toMatch(/measured the same way/);
    }
  });

  it('respects which channels are switched on', () => {
    const only = decisions(30, ['meta']);
    for (const c of only) {
      if (c.channel) expect(c.channel).toBe('meta');
    }
    /* And with one channel there is no cross-channel question to ask. */
    expect(only.some((c) => c.kind === 'cross-channel-cost-gap')).toBe(false);
  });
});
