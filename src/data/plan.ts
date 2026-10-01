import type { ChannelName } from '../styles/tokens';
import type { Candidate } from './decisions';
import { totals, type Range } from './metrics';
import type { Sample } from './evidence';

/**
 * ⭐ THE PLAN -- the engine's cards, added up.
 *
 * Twelve cards is a pile. A buyer does not take moves one at a time and hope
 * they compose; they ask "if I do all of this, where does the WEEK land?" --
 * how much spend comes out, how much goes back in, how many leads that buys or
 * costs, and what the account then pays per lead. Every card now carries its
 * effect on a week (`Candidate.effect`), so the answer is a sum, not a guess.
 *
 * What it deliberately leaves out, and says so:
 *   - QUESTIONS (tier 3). Nobody acts on a question. Podcasts stays as it is
 *     until the holdout answers it.
 *   - HELD-BACK findings. Could be chance, or not worth the marginal price.
 *   - Moves with no money in them -- add a variant, run a test, approve -- are
 *     listed as "also", without numbers, because they have none.
 *
 * ⚠️ The sum inherits every card's assumptions. A raise's leads come off its
 * curve, and the curve may be the stated default; the plan says when it is.
 */
export interface Plan {
  /** Moves with money in them, in the engine's order. */
  moves: Candidate[];
  /** Ready moves with no money in them. */
  also: Candidate[];
  /** Weekly. Positive numbers; `net` is signed. */
  freed: number;
  added: number;
  leadsLost: number;
  leadsGained: number;
  before: Week;
  after: Week;
  /** Any raise in the plan rests on an assumed (not measured) curve. */
  assumed: boolean;
}

export interface Week extends Sample { cac: number }

const week = (x: Sample): Week => ({ ...x, cac: x.leads > 0 ? x.spend / x.leads : Infinity });

export function planFrom(found: Candidate[], range: Range, channels: ChannelName[]): Plan {
  const ready = found.filter((c) => c.tier !== 3 && !c.held);
  const moves = ready.filter((c) => c.effect && (c.effect.spend !== 0 || c.effect.leads !== 0));
  const also = ready.filter((c) => !moves.includes(c));

  const sum = (pick: (e: Sample) => number) => moves.reduce((a, c) => a + pick(c.effect!), 0);
  const freed = -sum((e) => Math.min(0, e.spend));
  const added = sum((e) => Math.max(0, e.spend));
  const leadsLost = -sum((e) => Math.min(0, e.leads));
  const leadsGained = sum((e) => Math.max(0, e.leads));

  /* The account's week now: the selected window, scaled to seven days. */
  const t = channels.reduce((a, ch) => {
    const x = totals(ch, range);
    return { spend: a.spend + x.spend, leads: a.leads + x.leads };
  }, { spend: 0, leads: 0 });
  const before = week({ spend: (t.spend / range) * 7, leads: (t.leads / range) * 7 });
  const after = week({
    spend: Math.max(0, before.spend - freed + added),
    leads: Math.max(0, before.leads - leadsLost + leadsGained),
  });

  const assumed = moves.some((c) => /Assumed, not measured/.test(c.expectation?.assuming ?? ''));
  return { moves, also, freed, added, leadsLost, leadsGained, before, after, assumed };
}
