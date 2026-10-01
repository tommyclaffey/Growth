import type { ChannelName } from '../styles/tokens';
import { CAMPAIGNS } from './campaigns';
import { campaignTotals } from './campaignSeries';
import { stageOf } from './campaignStatus';
import { changeThreshold } from './notifications';
import { channelBudgetForRange } from './profile';
import {
  CHANNEL_LABEL, LAST_WEEK, activeChannels, delta, totals, type Range,
} from './metrics';

/**
 * ⭐ "WHAT IF" -- the scaling questions a growth team actually asks.
 *
 * "Where should more budget go?", "what if I move $5k from podcasts to TikTok?",
 * "how do I get more of what's working on Affiliates?" Every one of these is a
 * PROJECTION, and it is held to the tier-2 rule: the arithmetic is exact, and
 * the assumption it rests on is stated every time, in words, beside the number.
 *
 * The two assumptions that matter, and that every answer carries:
 *
 *   1. COST PER LEAD HOLDS as spend grows. It never quite does -- audiences
 *      saturate and auctions get dearer -- so every projection is a ceiling.
 *   2. LAST TOUCH. Cross-channel comparisons are measured on the last click,
 *      which flatters the channel nearest the sale. Moving money between
 *      channels on CAC alone can move it away from what started the journey.
 *      That is the podcast trap the decision engine refuses to resolve; a
 *      what-if does not get to pretend it away.
 *
 * And one guard: a channel whose CAC jumped this week is not recommended for
 * more money until someone knows why. Scaling into a spike is how a bad week
 * becomes a bad month.
 */

export const ASSUME_CAC_HOLDS =
  'each channel keeps its current cost per lead as spend grows. It usually rises as audiences are used up, so treat these as ceilings.';
export const ASSUME_LAST_TOUCH =
  'CAC here is measured on the last click, which flatters channels near the sale. A channel that starts journeys can look more expensive than it is.';

export interface ChannelOption {
  channel: ChannelName;
  cac: number;
  /** Leads the extra money would buy at the current CAC. */
  leads: number;
  /** Why this channel is held back, if it is. */
  hold?: string;
  /** Unspent budget for the range, when the channel has a budget. Negative = over. */
  room?: number;
}

export interface ScaleAnswer {
  extra: number;
  range: Range;
  /** Best first; held channels listed last. */
  options: ChannelOption[];
}

/** A sensible default top-up: 10% of the period's spend, rounded to $1,000. */
export function defaultExtra(range: Range, channels = activeChannels()): number {
  const spend = channels.reduce((a, c) => a + totals(c, range).spend, 0);
  return Math.max(1000, Math.round((spend * 0.1) / 1000) * 1000);
}

/** Why a channel should not get more money right now -- or undefined. */
function holdFor(ch: ChannelName): string | undefined {
  const wow = delta(ch, 'CAC', LAST_WEEK);
  if (wow >= changeThreshold()) {
    return `its CAC rose ${wow}% this week — hold new money until a week comes back at its usual cost`;
  }
  return undefined;
}

/** Where extra money buys the most leads, at current rates. */
export function whereToScale(extra: number, range: Range, channels = activeChannels()): ScaleAnswer {
  const options = channels
    .map((ch) => {
      const cac = totals(ch, range).cac;
      const planned = channelBudgetForRange(ch, range);
      const room = planned === undefined ? undefined : planned - totals(ch, range).spend;
      return { channel: ch, cac, leads: cac > 0 ? extra / cac : 0, hold: holdFor(ch), room };
    })
    .filter((o) => o.cac > 0)
    .sort((a, b) => (Number(!!a.hold) - Number(!!b.hold)) || (a.cac - b.cac));
  return { extra, range, options };
}

export interface MoveAnswer {
  amount: number;
  from: ChannelName;
  to: ChannelName;
  lost: number;
  gained: number;
  net: number;
  hold?: string;
}

/** Leads lost from one channel against leads gained in another, at current rates. */
export function moveBudget(amount: number, from: ChannelName, to: ChannelName, range: Range): MoveAnswer {
  const cf = totals(from, range).cac;
  const ct = totals(to, range).cac;
  const lost = cf > 0 ? amount / cf : 0;
  const gained = ct > 0 ? amount / ct : 0;
  return { amount, from, to, lost, gained, net: gained - lost, hold: holdFor(to) };
}

export interface CampaignOption {
  id: string;
  name: string;
  cac: number;
  spend: number;
  /** Leads a 25% budget increase would buy at the current CAC. */
  plusLeads: number;
}

/** Inside one channel: which running campaign to push, best cost first. */
export function scaleWithin(ch: ChannelName, range: Range): { options: CampaignOption[]; hold?: string } {
  const options = CAMPAIGNS
    .filter((c) => c.channel === ch && stageOf(c.id) === 'Active')
    .map((c) => {
      const t = campaignTotals(c.id, range);
      return { id: c.id, name: c.name, cac: t.cac, spend: t.spend, plusLeads: t.cac > 0 ? (t.spend * 0.25) / t.cac : 0 };
    })
    .filter((o) => o.cac > 0)
    .sort((a, b) => a.cac - b.cac);
  return { options, hold: holdFor(ch) };
}

/**
 * The money in a question. "$5k", "$5,000", "5,000", "5000 dollars", "1.5k",
 * "$1.5 million" -> 5000 / 1500 / 1500000. "$0" -> 0 (said, so answered, never
 * swapped for a default). Undefined when no amount is named.
 *
 * 🐛 Fixed Sept 29: "5,000" (no $) was not read, so "move 5,000 from Meta"
 * silently moved the $8,000 default; "$500 kept" read the k of "kept" and
 * became $500,000; "$1.5 million" was $1.50.
 *
 * NOT money: "30 days", "7 weeks", "25%", "3x", a bare year, and any bare
 * number under 100 -- "the last 30 days" must never become a $30 budget.
 */
export function parseAmount(q: string): number | undefined {
  const re = /(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(k|thousand|mm|m|million)?\b(\s*dollars|\s*bucks)?/gi;
  for (const m of q.matchAll(re)) {
    const [whole, dollar, int, frac, unit, word] = m;
    const n = Number(int.replace(/,/g, '') + (frac ?? ''));
    const after = q.slice((m.index ?? 0) + whole.length);
    const mult = !unit ? 1 : /^(k|thousand)$/i.test(unit) ? 1_000 : 1_000_000;
    /* "m" alone is minutes as often as millions -- only with a $. */
    if (unit && /^m$/i.test(unit) && !dollar) continue;
    const money = Boolean(dollar || word || (unit && mult > 1));
    if (!money) {
      if (/^\s*(days?|weeks?|months?|years?|%|percent|x\b|times|leads?|clicks?|ads?|campaigns?)/i.test(after)) continue;
      if (n < 100) continue;
      if (!int.includes(',') && n >= 1900 && n <= 2100 && !frac) continue;   // a year
    }
    const v = n * mult;
    if (Number.isFinite(v) && v >= 0) return v;
  }
  return undefined;
}

export const label = (ch: ChannelName) => CHANNEL_LABEL[ch];
