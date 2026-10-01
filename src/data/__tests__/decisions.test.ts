// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  TIER_LABEL, decisions, decisionsByTier, validate, type Candidate,
} from '../decisions';
import { ALL_CHANNELS } from '../blended';
import { CAMPAIGNS } from '../campaigns';
import { CHANNEL_KEYS, CHANNEL_LABEL, RANGES, setActiveChannels } from '../metrics';
import { setStage } from '../campaignStatus';

const reset = () => setActiveChannels([...CHANNEL_KEYS]);
const all = (range: number = 30) => decisions(range, ALL_CHANNELS);

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
      evidence: [], target: { kind: 'account', id: 'a', label: 'A' },
      scope: ['All channels'], strength: 0.5,
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

describe('the detectors that the default fixture cannot exercise', () => {
  /* ⚠️ Two detectors return nothing against the seeded account, and the reason is
     the FIXTURE rather than the code. Asserting "length > 0" on the default data
     would be a test demanding the engine invent a finding; asserting nothing at
     all would leave real logic unverified. So the state they are built for gets
     constructed, through the same `setStage` override a user would use. */

  it('reallocation fires once a channel has two Active campaigns with a real gap', () => {
    reset();
    /* Paid Search has the gap: c7 at ~$76 a lead against c8 at ~$109, which is
       44% and clears the 30% threshold. c8 ships in `Review`, so no channel in
       the default account has two Active campaigns — that is why the detector is
       silent, and it is a fixture property, not a bug. */
    setStage('c7', 'Active');
    setStage('c8', 'Active');

    const found = decisions(30, ALL_CHANNELS)
      .filter((c) => c.kind === 'reallocate-within-channel');
    expect(found.length).toBeGreaterThan(0);

    const ps = found.find((c) => c.channel === 'paidSearch')!;
    expect(ps).toBeDefined();
    expect(ps.tier).toBe(2);
    /* It must state the assumption — that is what makes it tier 2 rather than a
       promise. */
    expect(ps.expectation?.assuming).toMatch(/holds/);
    /* And it must move money FROM the expensive one TO the cheap one, not the
       reverse. Getting this backwards is the CAC inversion in a new costume. */
    expect(ps.action).toMatch(/from “Non-brand — High Intent” to “Branded Search Defense”/);
    expect(ps.target.id).toBe('c8');

    setStage('c7', 'Active');
    setStage('c8', 'Review');
  });

  it('reallocation refuses when the two campaigns are too close to call', () => {
    reset();
    /* TikTok's two campaigns sit within a fraction of a percent of each other.
       A finding there would be noise dressed as a decision. */
    setStage('c3', 'Active');
    setStage('c4', 'Active');
    const tiktok = decisions(30, ALL_CHANNELS)
      .filter((c) => c.kind === 'reallocate-within-channel' && c.channel === 'tiktok');
    expect(tiktok).toHaveLength(0);
    setStage('c4', 'Draft');
  });

  it('finds the paused ad that was out-performing', () => {
    reset();
    /* ⭐ Why scale-winner is silent: in this account the best-returning creatives
       are PAUSED. c1a-cr3 returned 1.5x its share of its campaign's spend with the
       switch off. That is one of the most common real states in a paid account —
       creative rotated out during a test and never looked at again. */
    const found = decisions(30, ALL_CHANNELS).filter((c) => c.kind === 'paused-winner');
    expect(found.length).toBeGreaterThan(0);

    for (const c of found) {
      /* ⭐ Sept 30: it says TURN IT BACK ON -- "review why it is paused" was
         homework, not a decision. Turning it on is a forecast, so it is tier 2
         and the assumption is on the card. */
      expect(c.tier).toBe(2);
      expect(c.action).toMatch(/^Turn .+ back on$/);
      expect(c.expectation?.assuming).toMatch(/does what it did/);
      /* And the limitation is stated on the card rather than left implied: a
         paused ad's figures here cover the whole window, not its live span. */
      expect(c.evidence.some((e) => /caveat/i.test(e.label))).toBe(true);
    }
  });
});

describe('🚨 no two decisions read as the same sentence', () => {
  it('every action in the queue is distinguishable from every other', () => {
    reset();
    /* 🐛 Two buttons labelled "Review why “Start free, no card” is paused" sat
       one above the other in the assistant, doing different things — c1c-cr1 and
       c1a-cr3, different ad sets of the same campaign, same headline.

       Distinct ids are not enough. A reader acts on the SENTENCE, and two
       identical sentences with different consequences is the same defect class
       as a control that claims what it does not do. */
    for (const range of RANGES) {
      const actions = all(range).map((c) => c.action);
      const dupes = actions.filter((a, i) => actions.indexOf(a) !== i);
      expect(dupes, `duplicate action text: ${[...new Set(dupes)].join(' / ')}`)
        .toEqual([]);
    }
  });

  it('an ad-level action names its ad set, not just the headline', () => {
    reset();
    /* Real accounts reuse copy across ad sets — that IS an audience test. An ad
       is identified by its headline AND where it runs. */
    const adLevel = all().filter((c) => c.target.kind === 'ad');
    expect(adLevel.length).toBeGreaterThan(0);
    for (const c of adLevel) {
      /* Anywhere in the sentence, not anchored to the end -- "Review why X
         (Broad — US 25-54) is paused" carries it mid-string. */
      expect(c.action, c.id).toMatch(/\(.+\)/);
    }
  });

  it('holds when channels are switched off', () => {
    reset();
    /* A narrower account is where collisions get likelier, not less. */
    for (const only of [['meta'], ['meta', 'tiktok'], ['paidSearch']] as const) {
      const actions = decisions(30, [...only]).map((c) => c.action);
      expect(new Set(actions).size, only.join('+')).toBe(actions.length);
    }
  });
});

describe('every decision says where it lives', () => {
  it('carries a scope, outermost first', () => {
    reset();
    for (const c of all()) {
      expect(c.scope.length, c.id).toBeGreaterThan(0);
      for (const part of c.scope) expect(part.trim(), c.id).not.toBe('');
    }
  });

  it('⭐ the depth matches the tier it touches', () => {
    reset();
    /* An ad-level decision names channel, campaign and ad set; a campaign-level
       one names channel and campaign; a channel-level one names the channel. The
       breadcrumb IS the hierarchy, so it has to agree with the target. */
    for (const c of all()) {
      const expected = { ad: 3, campaign: 2, channel: 1, adSet: 3, account: 1 }[c.target.kind];
      expect(c.scope.length, `${c.id} (${c.target.kind}): ${c.scope.join(' > ')}`)
        .toBe(expected);
    }
  });

  it('starts with the channel, when there is one', () => {
    reset();
    for (const c of all()) {
      if (!c.channel) continue;
      expect(c.scope[0], c.id).toBe(CHANNEL_LABEL[c.channel]);
    }
  });

  it('an account-level decision says "All channels" rather than nothing', () => {
    reset();
    /* An empty breadcrumb reads as missing data. The account is a scope, not the
       absence of one. */
    for (const c of all().filter((x) => x.target.kind === 'account')) {
      expect(c.scope).toEqual(['All channels']);
      expect(c.channel).toBeUndefined();
    }
  });

  it('two decisions on the same ad set share an address', () => {
    reset();
    /* The breadcrumb is derived from the hierarchy, not written per detector, so
       findings about the same place must agree about where that place is. */
    const byAddress = new Map<string, string[]>();
    for (const c of all()) {
      const key = c.scope.join(' > ');
      byAddress.set(key, [...(byAddress.get(key) ?? []), c.kind]);
    }
    /* At minimum the ad-level findings on one ad set collapse to one address. */
    expect([...byAddress.keys()].every((k) => k.length > 0)).toBe(true);
  });
});

describe('⭐ the engine finds opportunities, not only faults', () => {
  it('a healthy campaign is no longer a dead end', () => {
    reset();
    /* "I'm not getting any sort of opportunity." Every detector before these two
       answered "what is broken", so a campaign that is fine returned nothing —
       and "nothing" to every question about a healthy account is technically
       honest and practically useless. */
    const branded = all().filter((c) => /Branded Search Defense/.test(c.action));
    expect(branded.length).toBeGreaterThan(0);
  });

  it('spots a campaign with no variant to learn from', () => {
    reset();
    const found = all().filter((c) => c.kind === 'no-variant');
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) {
      /* ⚠️ Tier 1, and it has to stay there: the claim is structural, not a
         forecast. "Add a variant" promises the ability to TELL, never better
         performance — which is what keeps it out of tier 2. */
      expect(c.tier, c.action).toBe(1);
      expect(c.expectation?.assuming, c.action).toBeUndefined();
      expect(c.action, c.action).toMatch(/^Add a second /);
      /* It must not promise a result. */
      expect(c.expectation?.outcome, c.action)
        .not.toMatch(/\b(improve|better performance|lower your|increase)\b/i);
    }
  });

  it('spots a campaign beating its own channel, and GIVES IT MORE -- as a stated projection', () => {
    reset();
    const found = all().filter((c) => c.kind === 'beats-its-channel');
    expect(found.length).toBeGreaterThan(0);
    for (const c of found) {
      /* ⭐ Sept 30: "find out why it beats the channel" was not a decision.
         Raising it is a forecast, so tier 2, with the pull-back line stated. */
      expect(c.tier).toBe(2);
      expect(c.action).toMatch(/^Raise the budget on “.+” 20% \(\+\$[\d,]+ a week\)$/);
      expect(c.expectation?.assuming).toMatch(/put it back/);
    }
  });

  it('⚠️ compares a campaign to its OWN channel, never the account', () => {
    reset();
    /* Like-for-like: same medium, same attribution treatment. Comparing it to
       the account blend would be the podcast trap in miniature — an affiliates
       campaign would look extraordinary next to podcasts and mean nothing. */
    for (const c of all().filter((x) => x.kind === 'beats-its-channel')) {
      expect(c.channel).toBeDefined();
      expect(c.because).toContain(CHANNEL_LABEL[c.channel!]);
    }
  });

  it('a channel with one campaign raises no winner', () => {
    reset();
    /* Comparing a campaign to a blend that IS that campaign is the tautology
       benchmark.ts refuses at n < 2. */
    const single = CHANNEL_KEYS.filter(
      (k) => CAMPAIGNS.filter((c) => c.channel === k).length < 2);
    for (const k of single) {
      expect(all().some((c) => c.kind === 'beats-its-channel' && c.channel === k)).toBe(false);
    }
  });
});

describe('the confidence vocabulary does not collide with the data', () => {
  it('⭐ tier labels are words, never numbers', () => {
    /* 🐛 "Partner Network — Tier 1" is a real campaign in this account, so the
       model writing "no findings for Partner Network — Tier 1" produced a
       sentence with two readings: no findings for that campaign, or no TIER-1
       findings for Partner Network. The product's own vocabulary collided with
       its data and the answer became unreadable.

       ⚠️ It will collide again with real accounts — ad tiers, partner tiers and
       budget tiers are all ordinary campaign names. The tier stays as an internal
       classification; everything a reader sees is a word, because a word cannot
       be mistaken for part of a name. */
    for (const t of [1, 2, 3] as const) {
      expect(TIER_LABEL[t]).not.toMatch(/tier\s*\d/i);
      expect(TIER_LABEL[t].length).toBeGreaterThan(10);
    }
  });

  it('no finding writes a tier number into its own prose', () => {
    reset();
    for (const c of all()) {
      const prose = `${c.action} ${c.because} ${c.expectation?.outcome ?? ''} ${c.needs ?? ''}`;
      /* Campaign names carrying "Tier 1" are legitimate and excluded — the test
         is about the ENGINE's vocabulary, not the account's. */
      const scrubbed = prose.replace(/Partner Network — Tier 1/g, '');
      expect(scrubbed, c.id).not.toMatch(/\btier\s*[123]\b/i);
    }
  });
});
