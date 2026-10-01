import type { ChannelName } from '../styles/tokens';
import { CAMPAIGNS } from './campaigns';
import { campaignRows, campaignTotals } from './campaignSeries';
import { stageFingerprint, stageOf } from './campaignStatus';
import { rankedAds, type RankedAd } from './adRanking';
import { creativeById, creativeRows, creativesFor } from './creative';
import { CHANNEL_DEPTH } from './channelDepth';
import { formatDerived } from './channelMetrics';
import { budgetForRange, channelBudgets } from './profile';
import { structureVersion } from './structure';
import {
  CHANNEL_LABEL, LAST_WEEK, activeChannels, dataVersion, formatMetric, rowsFor, totals, windowEnd, type DayRow, type Range,
} from './metrics';
import { blendedTotal } from './blended';
import { changeThreshold, notifications } from './notifications';
import { projectRaise, rateTest, responseCurve, type Confidence, type Curve, type Sample } from './evidence';
/* Re-exported so the server's one ssrLoadModule of the engine also gets the
   plan. plan.ts imports only TYPES from here, so there is no runtime cycle. */
export { planFrom } from './plan';

/**
 * The decision engine.
 *
 * ⭐ THE ARCHITECTURAL CHOICE, and everything else follows from it: **no model
 * decides anything here.** This module enumerates candidate decisions from the
 * data, deterministically, and computes the arithmetic behind each one. A model's
 * only job — later, optionally — is to write the argument in better prose than a
 * template can. It is never handed raw numbers to reason over.
 *
 * Three reasons, in order:
 *
 *   1. **The maths becomes testable.** These are pure functions with unit tests,
 *      like every other tier in this codebase. An LLM's arithmetic cannot be
 *      unit tested, and arithmetic is the part where being wrong costs money.
 *   2. **It works with no API key**, so it works in the deployed static build —
 *      the constraint that already left Slack and the assistant as local-only.
 *   3. It follows the precedent already here. `assistantClient.ts`: *"THE
 *      FALLBACK IS THE FEATURE, not error handling bolted on."*
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🚨 THE RULE THIS WHOLE MODULE IS BUILT AROUND.
 *
 * The assistant's system prompt, written months before any of this: *"You can say
 * WHAT changed and BY HOW MUCH. You cannot say WHY. This data has no attribution
 * model, no campaign log, and no outside context."*
 *
 * **A decision is a causal claim.** "Move budget from A to B" means "B will
 * convert it better." So the feature is, on its face, the thing this product
 * already promised not to do.
 *
 * ⭐ The example that proves the rule earns its keep: the FIRST recommendation a
 * naive engine produces from this data is *"cut podcast spend — $129 a lead
 * against Meta's $36."* It is the best-supported number on the screen and it is
 * probably **wrong**. Podcasts are upper-funnel; a last-touch dashboard
 * systematically undervalues them, and the podcast ad is very often what caused
 * the branded search Meta then took credit for. Growth has no attribution model,
 * so it cannot see that — and neither can a model reading its numbers.
 *
 * **So candidates are classified by what KIND of claim they are, and ranked by
 * how well-supported they are — never by the size of the number.** The biggest
 * dollar figure available here is almost always the least supportable one.
 */

export type Tier = 1 | 2 | 3;

export const TIER_LABEL: Record<Tier, string> = {
  1: 'Provable from this data',
  2: 'Projection, with a stated assumption',
  3: 'This data cannot answer it',
};

export type DecisionKind =
  | 'spend-return-mismatch'
  | 'paused-winner'
  | 'scale-winner'
  | 'reallocate-within-channel'
  | 'stale-review'
  | 'closed-campaign-open-task'
  | 'no-variant'
  | 'beats-its-channel'
  | 'concentration-risk'
  | 'pacing'
  | 'cross-channel-cost-gap'
  | 'holdout-test'
  | 'weekly-move'
  | 'slow-leak';

export interface Evidence {
  label: string;
  value: string;
}

export interface Expectation {
  /** What is expected if the action is taken. */
  outcome: string;
  /**
   * The assumption it rests on.
   *
   * ⚠️ REQUIRED on tier 2 and forbidden on tier 1 — that is the entire
   * difference between the two tiers, and `validate()` enforces it. A projection
   * whose assumption is invisible is a guess wearing a fact's clothes.
   */
  assuming?: string;
  /** ISO yyyy-mm-dd. Computed from the range, never stored as "in 30 days". */
  checkOn: string;
}

export interface Target {
  kind: 'campaign' | 'adSet' | 'ad' | 'channel' | 'account';
  id: string;
  label: string;
}

export interface Candidate {
  /** Stable and derived from the finding, so the same finding cannot appear twice. */
  id: string;
  tier: Tier;
  kind: DecisionKind;
  /**
   * The action, imperative — or on tier 3, the QUESTION.
   *
   * Tier 3 never phrases itself as advice. "Cut podcasts" and "Is podcast spend
   * driving your branded search?" are different claims, and only one of them is
   * supportable.
   */
  action: string;
  /** The argument, one line, built from the evidence below it. */
  because: string;
  evidence: Evidence[];
  /** Absent on tier 3 — there is nothing to expect from a question. */
  expectation?: Expectation;
  /** Tier 3 only: what it would take to actually answer this. */
  needs?: string;
  target: Target;
  /**
   * Where this decision lives, outermost first — the breadcrumb.
   *
   * ⚠️ A decision without its scope is an instruction with no address. "Review
   * why 'Start free, no card' is paused" and "Review pacing" read as the same
   * KIND of thing in a list, and one touches a single creative inside one ad set
   * of one campaign while the other is the entire account. The reader cannot
   * weigh them against each other without knowing which is which, and the
   * evidence rows below say it too quietly and too late.
   *
   * Built by the detector rather than derived in the card, because the detector
   * is the only thing that knows the full path — by the time a Target reaches the
   * UI it is one id and one label, and the tiers above it are gone.
   */
  scope: string[];
  channel?: ChannelName;
  /**
   * Dollars in play. **For display only — never for ranking.**
   * Ranking by this is precisely how the podcast trap reaches the top.
   */
  atStake?: number;
  /** Within-tier ordering: how strong the finding is, 0–1. Not money. */
  strength: number;
  /**
   * The ONE number this decision should move, when the detector knows it
   * better than its kind does -- a weekly move can end in a pause, a cut or a
   * raise, and each is graded on a different number. See grading.ts.
   */
  measure?: { key: string; label: string; better: 'higher' | 'lower' | 'closer-to-one' | 'state' };
  /**
   * ⭐ The two sides of the comparison the claim rests on -- subject first, the
   * thing it is measured against second (NOT containing the subject). Set by
   * every detector whose claim is "A costs more/less than B". Structural
   * findings (one ad group, one ad carrying a channel) have none: they are
   * counts, not estimates, and there is no chance in them to test.
   */
  compare?: [Sample, Sample];
  /** Computed from `compare` in assembly -- see evidence.ts. */
  confidence?: Confidence;
  /**
   * ⭐ What taking it does to a WEEK: spend and leads, signed. A pause is
   * negative on both; a raise positive on both, with the leads off the curve.
   * The plan (plan.ts) adds these up into one "if you take all of it" line.
   * Absent on moves with no money in them -- add a variant, run a test.
   */
  effect?: Sample;
  /** Set when the engine found this and held it back; the sentence says why. */
  held?: { reason: HeldReason; sentence: string };
}

/* ---------------------------------------------------------------- helpers -- */

function checkDate(range: Range, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + range);
  /* 🐛 Was toISOString() -- a UTC date. In a US evening that is already
     tomorrow, so every check date landed a day late, and grading (which
     compares LOCAL dates) said "Check in 1 day" on the day itself. */
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "Meta’s", "Affiliates’" -- never "Affiliates’s". Curly, like all copy. */
const poss = (name: string) => (name.endsWith('s') ? `${name}’` : `${name}’s`);

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/* One week's spend and leads, and the cost per lead between them. */
interface Week { spend: number; leads: number }
const weekOf = (rows: DayRow[]): Week =>
  rows.reduce((a, r) => ({ spend: a.spend + r.spend, leads: a.leads + r.leads }), { spend: 0, leads: 0 });
/** Infinity when nothing was bought -- the worst cost there is, never a zero. */
const cacOf = (w: Week) => (w.leads > 0 ? w.spend / w.leads : Infinity);
const money = (n: number) => formatMetric('Spend', n);
const cacText = (n: number) => formatDerived('CAC', n);
const count = (n: number) => Math.round(n).toLocaleString();

/** "Meta’s budget" / "the budget on “Spring Leads”" -- a possessive on a
    campaign name full of dashes reads badly, so campaigns get quoted. */
const budgetOf = (name: string, campaign: boolean) =>
  (campaign ? `the budget on \u201c${name}\u201d` : `${poss(name)} budget`);

/**
 * How an ad is named in an action.
 *
 * 🐛 The headline alone is not unique and never was. `c1c-cr1` and `c1a-cr3` are
 * different ads in different ad sets of the same campaign, both headlined "Start
 * free, no card" — so two decisions rendered as the SAME sentence, with two
 * buttons doing two different things and no way to tell them apart.
 *
 * ⚠️ And this is not a fixture quirk to work around. Real accounts reuse copy
 * across ad sets constantly — that IS what an audience test is. An ad is
 * identified by its headline AND the ad set it runs in; naming only the headline
 * was the mistake, not the duplication.
 */
function adName(headline: string, adSetName: string): string {
  return `“${headline}” (${adSetName})`;
}

/** B minus A: the reference a subject is compared against, without the subject in it. */
const restOf = (all: Sample, part: Sample): Sample =>
  ({ spend: Math.max(0, all.spend - part.spend), leads: Math.max(0, all.leads - part.leads) });

/**
 * What a budget raise buys, on the thing's own response curve -- and the
 * sentence and stated assumption that go with it.
 *
 * ⭐ Every raise used to promise leads at today's AVERAGE price: "+$887 buys 29
 * more leads at $30.51". The next dollar in an auction buys the next-cheapest
 * impression, which is dearer than the last. So the projection is now made on
 * the curve, and the card names the MARGINAL price -- what the extra money
 * pays -- next to the average it is usually confused with.
 */
function onTheCurve(rows: DayRow[], base: Sample, r: number, per: string): {
  curve: Curve; r: number; extraLeads: number; marginalCac: number; outcome: string; assuming: string;
} {
  const curve = responseCurve(rows);
  const proj = projectRaise(base, r, curve);
  const avg = base.leads > 0 ? base.spend / base.leads : Infinity;
  const outcome = `About ${count(proj.extraLeads)} more leads ${per}, at about `
    + `${cacText(proj.marginalCac)} each for the extra money (today’s average: ${cacText(avg)}).`;
  const assuming = curve.measured
    ? `its last ${curve.days} days hold: each extra dollar has bought about `
      + `${Math.round(curve.b * 100)}% as much as the average one`
    : `the extra dollar buys about ${Math.round(curve.b * 100)}% as much as the average one. `
      + `Assumed, not measured: its spend has not moved enough to show how it responds`;
  return { curve, r, extraLeads: proj.extraLeads, marginalCac: proj.marginalCac, outcome, assuming };
}

/**
 * ⭐ HOW MUCH to raise -- not just whether.
 *
 * Every raise was a flat 20%. On the curve, the marginal price climbs with the
 * size of the raise, so "20%" could buy its last leads dearer than the very
 * benchmark the card praised it against: Branded Search "beat Paid Search's
 * $85.98" and its extra 20% would have paid ~$97 a lead.
 *
 * So: the biggest step (in 5% steps, up to `most`) whose extra money still
 * pays less than `ceiling` -- the number the card already names as the line.
 * None? Then no raise is worth making, and the finding is held back with
 * that reason instead of being shown as advice the arithmetic contradicts.
 */
function sizedRaise(rows: DayRow[], base: Sample, most: number, ceiling: number, per: string) {
  if (!(base.spend > 0 && base.leads > 0 && Number.isFinite(ceiling))) return null;
  for (let r = most; r >= 0.05 - 1e-9; r = Math.round((r - 0.05) * 100) / 100) {
    const p = onTheCurve(rows, base, r, per);
    if (p.marginalCac <= ceiling) return p;
  }
  return null;
}

/** Why a finding was found and not shown. */
export type HeldReason = 'chance' | 'marginal';

/** Range totals → one week. */
const perWeek = (x: Sample, range: number): Sample => ({ spend: (x.spend / range) * 7, leads: (x.leads / range) * 7 });

/**
 * What cutting spend by `r` gives up, on the curve: leads × (1 − (1−r)^b).
 * The money cut is the MARGINAL money -- the dearest leads go first -- so a
 * 20% cut costs well under 20% of the leads. Same curve as a raise, run backwards.
 */
function cutEffect(rows: DayRow[], base: Sample, r: number): Sample {
  const b = responseCurve(rows).b;
  return { spend: -base.spend * r, leads: -base.leads * (1 - (1 - r) ** b) };
}

/** What the smallest step (5%) would pay per extra lead -- the floor of any raise. */
function floorMarginal(rows: DayRow[], base: Sample): number {
  return onTheCurve(rows, base, 0.05, '').marginalCac;
}

function marginalHeld(marginal: number, ceiling: number, what: string): { reason: HeldReason; sentence: string } {
  return {
    reason: 'marginal',
    sentence: `Even a 5% raise would buy its extra leads at about ${cacText(marginal)}, `
      + `above ${what} of ${cacText(ceiling)}. More budget here costs more than it is worth.`,
  };
}

/* ------------------------------------------------------------- detectors -- */

/**
 * An ad taking materially more of its campaign's spend than it returns in leads.
 *
 * TIER 1. Both figures are shares of the same parent over the same window, so
 * this is arithmetic — no claim about why, and no claim that moving the money
 * elsewhere would work. The action is to stop, which is the only action this
 * data can support on its own.
 */
function spendReturnMismatch(range: Range, channels: ChannelName[], ranked?: RankedAd[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = ranked ?? rankedAds('Leads', 'absolute', range, channels);

  for (const c of CAMPAIGNS) {
    if (!channels.includes(c.channel)) continue;
    const mine = ads.filter((a) => a.campaign.id === c.id);
    if (mine.length < 2) continue;

    const spend = mine.reduce((a, x) => a + x.totals.spend, 0);
    const leads = mine.reduce((a, x) => a + x.totals.leads, 0);
    if (spend <= 0 || leads <= 0) continue;

    for (const a of mine) {
      /* Only Active ads. Recommending a pause on something already paused is a
         control that claims to change something it cannot. */
      if (a.creative.stage !== 'Active') continue;

      const sShare = a.totals.spend / spend;
      const lShare = a.totals.leads / leads;
      if (lShare <= 0) continue;

      const ratio = sShare / lShare;
      /* 1.6x and a floor on spend. Without the floor, an ad with $40 and one
         lead produces an alarming ratio and a decision worth nothing. */
      if (ratio < 1.6 || a.totals.spend < 500) continue;

      out.push({
        id: `mismatch:${a.creative.id}`,
        tier: 1,
        kind: 'spend-return-mismatch',
        action: `Pause ${adName(a.creative.headline, a.creative.adSetName)}`,
        because: `It gets ${pct(sShare)} of ${poss(c.name)} spend but brings in only ${pct(lShare)} of its leads.`,
        evidence: [
          { label: 'Share of campaign spend', value: pct(sShare) },
          { label: 'Share of campaign leads', value: pct(lShare) },
          { label: 'Its CAC', value: formatDerived('CAC', a.totals.leads > 0 ? a.totals.spend / a.totals.leads : 0) },
          { label: `${c.name} CAC`, value: formatDerived('CAC', spend / leads) },
        ],
        expectation: {
          /* Deliberately modest, and deliberately NOT "you will gain leads".
             Pausing frees spend; whether the freed spend performs is a separate
             claim this data cannot make. */
          outcome: `Frees ${formatMetric('Spend', a.totals.spend)} over the next ${range} days. `
            + `The campaign’s CAC improves if its other ads keep performing.`,
          checkOn: checkDate(range),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        scope: [CHANNEL_LABEL[a.channel], c.name, a.creative.adSetName],
        channel: a.channel,
        atStake: a.totals.spend,
        compare: [a.totals, restOf({ spend, leads }, a.totals)],
        effect: { spend: -perWeek(a.totals, range).spend, leads: -perWeek(a.totals, range).leads },
        /* How lopsided it is, capped — a 9x ratio is not nine times more
           actionable than a 3x one. */
        strength: Math.min(1, (ratio - 1.6) / 2.4),
      });
    }
  }

  return out;
}

/**
 * The inverse: an ad returning more than its share of spend.
 *
 * ⚠️ TIER 2, not tier 1 — and the asymmetry is the point. That the ad is
 * efficient TODAY is arithmetic. That it would stay efficient on more money is
 * an assumption, and usually a shaky one: ad sets hit audience ceilings, CPMs
 * rise with budget, and the best-performing creative is often the one shown to
 * the cheapest slice of an audience. Stopping something needs no forecast;
 * scaling it does.
 */
function scaleWinner(range: Range, channels: ChannelName[], ranked?: RankedAd[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = ranked ?? rankedAds('Leads', 'absolute', range, channels);

  for (const c of CAMPAIGNS) {
    if (!channels.includes(c.channel)) continue;
    if (stageOf(c.id) !== 'Active') continue;

    const mine = ads.filter((a) => a.campaign.id === c.id);
    if (mine.length < 2) continue;
    const spend = mine.reduce((a, x) => a + x.totals.spend, 0);
    const leads = mine.reduce((a, x) => a + x.totals.leads, 0);
    if (spend <= 0 || leads <= 0) continue;

    for (const a of mine) {
      if (a.creative.stage !== 'Active') continue;
      const sShare = a.totals.spend / spend;
      const lShare = a.totals.leads / leads;
      if (sShare <= 0) continue;

      const ratio = lShare / sShare;
      if (ratio < 1.4 || a.totals.leads < 20) continue;

      const cac = a.totals.spend / a.totals.leads;
      const campCac = spend / leads;
      const sized = sizedRaise(creativeRows(a.creative.id, 90), a.totals, 0.25, campCac, `over ${range} days`);
      const proj = sized ?? onTheCurve(creativeRows(a.creative.id, 90), a.totals, 0.25, `over ${range} days`);
      out.push({
        id: `scale:${a.creative.id}`,
        tier: 2,
        kind: 'scale-winner',
        action: `Raise the budget on ${adName(a.creative.headline, a.creative.adSetName)} ${pct(proj.r)}`,
        because: `It brings in ${pct(lShare)} of ${poss(c.name)} leads on just ${pct(sShare)} of its spend.`,
        evidence: [
          { label: 'Share of campaign leads', value: pct(lShare) },
          { label: 'Share of campaign spend', value: pct(sShare) },
          { label: 'Its CAC', value: formatDerived('CAC', cac) },
          { label: `${c.name} CAC`, value: formatDerived('CAC', spend / leads) },
        ],
        expectation: {
          outcome: `+${formatMetric('Spend', a.totals.spend * proj.r)}: ${proj.outcome}`,
          /* The condition that makes this tier 2. Stated, not implied. */
          assuming: proj.assuming,
          checkOn: checkDate(range),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        scope: [CHANNEL_LABEL[a.channel], c.name, a.creative.adSetName],
        channel: a.channel,
        atStake: a.totals.spend * proj.r,
        compare: [a.totals, restOf({ spend, leads }, a.totals)],
        effect: perWeek({ spend: a.totals.spend * proj.r, leads: proj.extraLeads }, range),
        ...(sized ? {} : { held: marginalHeld(floorMarginal(creativeRows(a.creative.id, 90), a.totals), campCac, `${poss(c.name)} average`) }),
        strength: Math.min(1, (ratio - 1.4) / 1.6),
      });
    }
  }

  return out;
}

/**
 * An ad that OUT-PERFORMED and is switched off.
 *
 * ⭐ Found because `scale-winner` would not fire, and the reason turned out to be
 * worth a detector of its own: in this account the best-returning creatives are
 * PAUSED. `c1a-cr3` returned 1.5x its share of its campaign's spend and is off.
 *
 * That is not a fixture quirk — it is one of the most common real states in a paid
 * account. Creative gets paused during a test, at the end of a flight, or because
 * someone rotated it out on a hunch, and nobody goes back to check what it was
 * doing when it stopped. **The engine noticing is the entire value.**
 *
 * ⭐ Sept 30: it says TURN IT BACK ON, as a tier-2 projection. It used to say
 * "review why it is paused" -- tier 1 because it claimed nothing, and useless
 * for the same reason. That it would do again what it did is an assumption,
 * so it is stated.
 *
 * ⚠️ And it states the limitation on the card. A paused ad's figures in this
 * dataset still cover the whole window, because the data layer has no per-ad
 * start and stop dates. So the numbers describe the period, not the ad's live
 * span, and the card says so rather than letting a reader assume otherwise.
 */
function pausedWinner(range: Range, channels: ChannelName[], ranked?: RankedAd[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = ranked ?? rankedAds('Leads', 'absolute', range, channels);

  for (const c of CAMPAIGNS) {
    if (!channels.includes(c.channel)) continue;
    /* Only inside campaigns that are still running. A paused ad in an Ended
       campaign is not a missed opportunity, it is just history. */
    if (stageOf(c.id) !== 'Active') continue;

    const mine = ads.filter((a) => a.campaign.id === c.id);
    if (mine.length < 2) continue;
    const spend = mine.reduce((a, x) => a + x.totals.spend, 0);
    const leads = mine.reduce((a, x) => a + x.totals.leads, 0);
    if (spend <= 0 || leads <= 0) continue;

    for (const a of mine) {
      if (a.creative.stage !== 'Paused') continue;
      const sShare = a.totals.spend / spend;
      const lShare = a.totals.leads / leads;
      if (sShare <= 0) continue;

      const ratio = lShare / sShare;
      if (ratio < 1.3 || a.totals.leads < 20) continue;

      const cac = a.totals.spend / a.totals.leads;
      out.push({
        id: `paused-winner:${a.creative.id}`,
        tier: 2,
        kind: 'paused-winner',
        action: `Turn ${adName(a.creative.headline, a.creative.adSetName)} back on`,
        because: `When it ran, it brought in ${pct(lShare)} of ${poss(c.name)} leads on `
          + `${pct(sShare)} of its spend. It paid ${formatDerived('CAC', cac)} a lead; the `
          + `campaign pays ${formatDerived('CAC', spend / leads)}. The campaign is still running.`,
        evidence: [
          { label: 'Status', value: 'Paused' },
          { label: 'Share of campaign leads', value: pct(lShare) },
          { label: 'Share of campaign spend', value: pct(sShare) },
          { label: 'Its CAC', value: formatDerived('CAC', cac) },
          /* Said on the card, not buried in a doc. */
          { label: 'Caveat', value: 'Figures cover the full period, not its live span' },
        ],
        expectation: {
          outcome: `About ${count(a.totals.leads)} leads over ${range} days at ${cacText(cac)} each `
            + `— what it brought in before.`,
          assuming: `it does what it did before it was paused. If it was paused for a reason `
            + `this data cannot see — an offer that ended, a brand rule — leave it off`,
          checkOn: checkDate(7),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        scope: [CHANNEL_LABEL[a.channel], c.name, a.creative.adSetName],
        channel: a.channel,
        measure: { key: `ad-leads:${a.creative.id}`, label: 'Leads on this ad', better: 'higher' },
        compare: [a.totals, restOf({ spend, leads }, a.totals)],
        effect: perWeek(a.totals, range),
        strength: Math.min(1, (ratio - 1.3) / 1.2),
      });
    }
  }

  return out;
}

/**
 * Moving money between two campaigns ON THE SAME CHANNEL.
 *
 * ⭐ TIER 2 — and the reason it is not tier 3 is the single most useful
 * distinction in this module.
 *
 * Reallocating ACROSS channels is a causal claim this data cannot support: the
 * channels are attributed differently, sit at different funnel depths, and a
 * last-touch dashboard will always flatter the one closest to the conversion.
 * That is the podcast trap, and it is handled below as a question.
 *
 * WITHIN one channel, the two campaigns are measured the same way, by the same
 * platform, under the same attribution window. The comparison is like-for-like,
 * so the remaining uncertainty is only whether the better campaign's efficiency
 * survives more budget — which is an assumption, so it gets stated, so it is
 * tier 2 rather than tier 1.
 */
function reallocateWithinChannel(range: Range, channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];

  for (const channel of channels) {
    const peers = CAMPAIGNS
      .filter((c) => c.channel === channel && stageOf(c.id) === 'Active')
      .map((c) => ({ c, t: campaignTotals(c.id, range) }))
      .filter((x) => x.t.leads > 0 && x.t.spend > 0);

    /* Fewer than two Active campaigns and there is nothing to move between. */
    if (peers.length < 2) continue;

    const byCac = [...peers].sort((a, b) => (a.t.spend / a.t.leads) - (b.t.spend / b.t.leads));
    const best = byCac[0];
    const worst = byCac[byCac.length - 1];
    const bestCac = best.t.spend / best.t.leads;
    const worstCac = worst.t.spend / worst.t.leads;

    /* A 30% gap, or it is noise dressed as a finding. */
    if (worstCac < bestCac * 1.3) continue;

    /* A quarter of the worse campaign's spend. Not all of it: recommending a
       campaign be emptied is a different and much larger decision. */
    const move = worst.t.spend * 0.25;
    /* The receiving campaign's extra leads come off its CURVE, not its average
       -- the money it gets is its marginal money. */
    const gain = onTheCurve(campaignRows(best.c.id, 90), best.t, move / best.t.spend, `over ${range} days`);
    const gained = gain.extraLeads;
    const lost = move / worstCac;
    if (gained <= lost) continue;

    out.push({
      id: `realloc:${channel}:${worst.c.id}:${best.c.id}`,
      tier: 2,
      kind: 'reallocate-within-channel',
      action: `Shift ${formatMetric('Spend', move)} from “${worst.c.name}” to “${best.c.name}”`,
      because: `Both run on ${CHANNEL_LABEL[channel]}, so they are measured the same way. `
        + `${worst.c.name} pays ${formatDerived('CAC', worstCac)} a lead. `
        + `${best.c.name} pays ${formatDerived('CAC', bestCac)}.`,
      evidence: [
        { label: `${worst.c.name} CAC`, value: formatDerived('CAC', worstCac) },
        { label: `${best.c.name} CAC`, value: formatDerived('CAC', bestCac) },
        { label: 'Gap', value: `${Math.round(((worstCac - bestCac) / bestCac) * 100)}%` },
        { label: 'Proposed move', value: formatMetric('Spend', move) },
      ],
      expectation: {
        outcome: `About ${Math.round(gained - lost)} more leads over ${range} days `
          + `(${Math.round(gained)} gained, ${Math.round(lost)} given up).`,
        assuming: `on ${Math.round((move / best.t.spend) * 100)}% more budget, for ${best.c.name}, ${gain.assuming}`,
        checkOn: checkDate(range),
      },
      target: { kind: 'campaign', id: worst.c.id, label: worst.c.name },
      scope: [CHANNEL_LABEL[channel], worst.c.name],
      channel,
      atStake: move,
      compare: [worst.t, best.t],
      effect: perWeek({ spend: 0, leads: gained - lost }, range),
      strength: Math.min(1, (worstCac / bestCac - 1.3) / 1.7),
    });
  }

  return out;
}

/**
 * A campaign sitting in Review.
 *
 * TIER 1, and the purest kind: it is a fact about the product's own state, with
 * no inference at all. Review means a person has to look at it, and a Review that
 * nobody returns to is a decision that silently never got made.
 */
function staleReview(range: Range, channels: ChannelName[]): Candidate[] {
  return CAMPAIGNS
    .filter((c) => channels.includes(c.channel) && stageOf(c.id) === 'Review')
    .map((c): Candidate => {
      const base = {
        id: `review:${c.id}`,
        tier: 1 as Tier,
        kind: 'stale-review' as DecisionKind,
        target: { kind: 'campaign' as const, id: c.id, label: c.name },
        scope: [CHANNEL_LABEL[c.channel], c.name],
        channel: c.channel,
        /* No atStake. Attaching a dollar figure would rank a decision that costs
           nothing to make alongside ones that move money. */
        strength: 0.5,
      };
      const t = campaignTotals(c.id, range);
      const ch = totals(c.channel, range);
      const chCac = ch.leads > 0 ? ch.spend / ch.leads : 0;
      const label = CHANNEL_LABEL[c.channel];

      /* ⭐ Sept 30: the engine says WHICH way, from its own cost against its
         channel's. "Decide on it" left the decision with the reader. Only a
         campaign with no figures to judge still asks. */
      if (t.leads >= 10 && chCac > 0) {
        const approve = t.cac <= chCac * 1.1;
        return {
          ...base,
          action: approve
            ? `Approve \u201c${c.name}\u201d — it pays ${cacText(t.cac)} a lead`
            : `End \u201c${c.name}\u201d — it pays ${cacText(t.cac)} a lead`,
          because: approve
            ? `That is in line with ${poss(label)} ${cacText(chCac)} average. It is waiting on a person to go live.`
            : `${label} averages ${cacText(chCac)}. It has spent ${money(t.spend)} on `
              + `${count(t.leads)} leads while waiting on a person.`,
          evidence: [
            { label: 'Stage', value: 'Review' },
            { label: 'Its CAC', value: cacText(t.cac) },
            { label: `${label} CAC`, value: cacText(chCac) },
            { label: 'Spend', value: money(t.spend) },
          ],
          expectation: {
            outcome: approve
              ? 'It runs at a cost in line with the rest of the channel.'
              : `Frees ${money(t.spend)} over the next ${range} days.`,
            checkOn: checkDate(7),
          },
          compare: [t, restOf(ch, t)],
          /* Approve: it is already spending while it waits, so going live
             changes nothing in the week. End: its spend and leads stop. */
          ...(approve ? {} : { effect: { spend: -perWeek(t, range).spend, leads: -perWeek(t, range).leads } }),
        };
      }
      return {
        ...base,
        action: `Decide on \u201c${c.name}\u201d — it is in Review`,
        because: `It is waiting on a person, and it has too few leads to call either way.`,
        evidence: [
          { label: 'Stage', value: 'Review' },
          { label: 'Channel', value: label },
          { label: 'Objective', value: c.objective },
        ],
        expectation: {
          outcome: 'It moves to Active or Ended. Either one is progress.',
          checkOn: checkDate(7),
        },
      };
    });
}

/**
 * One ad carrying an outsized share of a whole channel's leads.
 *
 * TIER 1 as a statement of concentration. Note what it does NOT say: it does not
 * claim the ad will fatigue, because frequency data is not in this dataset. It
 * says the channel has a single point of failure, which is arithmetic.
 */
function concentrationRisk(range: Range, channels: ChannelName[], ranked?: RankedAd[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = ranked ?? rankedAds('Leads', 'absolute', range, channels);

  for (const channel of channels) {
    const mine = ads.filter((a) => a.channel === channel);
    if (mine.length < 3) continue;
    const leads = mine.reduce((a, x) => a + x.totals.leads, 0);
    if (leads <= 0) continue;

    const top = mine.reduce((a, b) => (b.totals.leads > a.totals.leads ? b : a));
    const share = top.totals.leads / leads;
    if (share < 0.45) continue;

    const noun = CHANNEL_DEPTH[channel].leaf.one.toLowerCase();
    out.push({
      id: `concentration:${channel}:${top.creative.id}`,
      tier: 1,
      kind: 'concentration-risk',
      action: `Build a second ${noun} for ${CHANNEL_LABEL[channel]}`,
      because: `One ${noun}, “${top.creative.headline}”, brings in ${pct(share)} of `
        + `${poss(CHANNEL_LABEL[channel])} leads. There are ${mine.length} live assets.`,
      evidence: [
        { label: `Top ${noun}’s share of channel leads`, value: pct(share) },
        { label: `${CHANNEL_LABEL[channel]} assets`, value: String(mine.length) },
        { label: 'Its leads', value: Math.round(top.totals.leads).toLocaleString() },
        { label: 'Channel leads', value: Math.round(leads).toLocaleString() },
      ],
      expectation: {
        outcome: `If this ${noun} stops working, ${pct(share)} of `
          + `${poss(CHANNEL_LABEL[channel])} leads go with it. A second one spreads the risk.`,
        checkOn: checkDate(range),
      },
      target: { kind: 'channel', id: channel, label: CHANNEL_LABEL[channel] },
      scope: [CHANNEL_LABEL[channel]],
      channel,
      strength: Math.min(1, (share - 0.45) / 0.4),
    });
  }

  return out;
}

/**
 * A campaign with nothing to compare against itself.
 *
 * ⭐ THE ENGINE ONLY KNEW HOW TO FIND PROBLEMS. Everything above answers "what is
 * broken", so a campaign that is fine returned nothing — and "nothing" to every
 * question about a healthy account is technically honest and practically useless.
 * Tommy, after the fourth such answer: "I'm not getting any sort of opportunity."
 *
 * This is the first detector that finds an OPPORTUNITY rather than a fault, and
 * it is still tier 1 because it claims nothing about performance. A campaign
 * running one ad set has no audience to compare against; a campaign whose ad sets
 * each hold one ad has no creative to compare against. That is a structural fact,
 * visible without judgement, and it is the most common reason an account stops
 * learning.
 *
 * ⚠️ The action is to ADD a variant, not to change a number. It cannot promise
 * better performance — it promises the ability to TELL, which is a different and
 * far more defensible claim, and it is why this stays tier 1.
 */
function noVariant(range: Range, channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];

  for (const c of CAMPAIGNS) {
    if (!channels.includes(c.channel)) continue;
    if (stageOf(c.id) !== 'Active') continue;

    const noun = CHANNEL_DEPTH[c.channel];
    const ads = creativesFor(c.id);
    const t = campaignTotals(c.id, range);
    if (t.spend <= 0) continue;

    if (c.adSets.length === 1) {
      out.push({
        id: `no-variant:adset:${c.id}`,
        tier: 1,
        kind: 'no-variant',
        action: `Add a second ${noun.group.one.toLowerCase()} to \u201c${c.name}\u201d`,
        because: `It runs one ${noun.group.one.toLowerCase()} on `
          + `${formatMetric('Spend', t.spend)}. There is nothing to compare it against.`,
        evidence: [
          { label: noun.group.many, value: '1' },
          { label: 'Spend', value: formatMetric('Spend', t.spend) },
          { label: 'CAC', value: formatDerived('CAC', t.cac) },
        ],
        expectation: {
          outcome: `A second ${noun.group.one.toLowerCase()} gives the first one something to beat. `
            + `Right now its ${formatDerived('CAC', t.cac)} CAC can’t be called good or bad.`,
          checkOn: checkDate(range),
        },
        target: { kind: 'campaign', id: c.id, label: c.name },
        scope: [CHANNEL_LABEL[c.channel], c.name],
        channel: c.channel,
        strength: 0.6,
      });
      continue;
    }

    const singles = c.adSets.filter((a) => ads.filter((x) => x.adSetId === a.id).length < 2);
    if (singles.length === c.adSets.length && c.adSets.length > 0) {
      out.push({
        id: `no-variant:ad:${c.id}`,
        tier: 1,
        kind: 'no-variant',
        action: `Add a second ${noun.leaf.one.toLowerCase()} in \u201c${c.name}\u201d`,
        because: `Each ${noun.group.one.toLowerCase()} runs a single `
          + `${noun.leaf.one.toLowerCase()}. No creative here is being tested.`,
        evidence: [
          { label: noun.group.many, value: String(c.adSets.length) },
          { label: noun.leaf.many, value: String(ads.length) },
          { label: 'Spend', value: formatMetric('Spend', t.spend) },
        ],
        expectation: {
          outcome: `Creative is the biggest lever in paid ads. A second `
            + `${noun.leaf.one.toLowerCase()} starts measuring it.`,
          checkOn: checkDate(range),
        },
        target: { kind: 'campaign', id: c.id, label: c.name },
        scope: [CHANNEL_LABEL[c.channel], c.name],
        channel: c.channel,
        strength: 0.5,
      });
    }
  }

  return out;
}

/**
 * A campaign beating the channel it runs on.
 *
 * ⭐ The other half of "only knew how to find problems". Every other detector
 * looks for something going wrong; this looks for something going RIGHT and says
 * so, because "this is your best campaign and here is by how much" is information
 * a dashboard should surface rather than leave a reader to derive.
 *
 * ⚠️ Like-for-like on purpose — a campaign against its OWN channel, same medium,
 * same attribution treatment. The same reasoning that makes within-channel
 * reallocation tier 2 rather than tier 3. Comparing it to the ACCOUNT would be the
 * podcast trap in miniature.
 *
 * ⭐ Sept 30: the action is to GIVE IT MORE, as a stated projection. It was "find
 * out why it beats the channel" -- homework, not a decision. Scaling is a
 * forecast, so this is tier 2 and says the number at which to pull back.
 */
function beatsItsChannel(range: Range, channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];

  for (const channel of channels) {
    /* ⚠️ The population is EVERY campaign on the channel, not just the active
       ones — because the channel total it is measured against includes them all.
       Counting only Active campaigns made Paid Search look like a one-campaign
       channel (its second is in Review) and skipped the comparison entirely,
       which is exactly the case that prompted this detector.

       A single-campaign channel is still skipped: comparing a campaign to a
       blend that IS that campaign is the tautology benchmark.ts already refuses
       at n < 2. */
    const population = CAMPAIGNS.filter((c) => c.channel === channel);
    if (population.length < 2) continue;

    /* Findings are only raised for campaigns you can still act on. */
    const peers = population.filter((c) => stageOf(c.id) === 'Active');
    if (peers.length === 0) continue;

    const ch = totals(channel, range);
    if (ch.leads <= 0) continue;
    const chCac = ch.spend / ch.leads;

    for (const c of peers) {
      const t = campaignTotals(c.id, range);
      if (t.leads < 50 || t.cac <= 0) continue;
      const better = (chCac - t.cac) / chCac;
      if (better < 0.1) continue;

      const week = { spend: (t.spend / range) * 7, leads: (t.leads / range) * 7 };
      const sized = sizedRaise(campaignRows(c.id, 90), week, 0.2, chCac, 'a week');
      const proj = sized ?? onTheCurve(campaignRows(c.id, 90), week, 0.2, 'a week');
      const raise = week.spend * proj.r;
      out.push({
        id: `beats-channel:${c.id}`,
        tier: 2,
        kind: 'beats-its-channel',
        action: `Raise ${budgetOf(c.name, true)} ${pct(proj.r)} (+${money(raise)} a week)`,
        /* Names the channel rather than saying "the channel". */
        because: `It pays ${formatDerived('CAC', t.cac)} a lead. The ${CHANNEL_LABEL[channel]} `
          + `average is ${formatDerived('CAC', chCac)}, so it is ${Math.round(better * 100)}% `
          + `better, on ${formatMetric('Spend', t.spend)}.`,
        evidence: [
          { label: `${c.name} CAC`, value: formatDerived('CAC', t.cac) },
          { label: `${CHANNEL_LABEL[channel]} CAC`, value: formatDerived('CAC', chCac) },
          { label: 'Better by', value: `${Math.round(better * 100)}%` },
          { label: 'Spend', value: formatMetric('Spend', t.spend) },
        ],
        expectation: {
          outcome: proj.outcome,
          assuming: `${proj.assuming}. If a week comes in above the ${CHANNEL_LABEL[channel]} `
            + `average of ${cacText(chCac)}, put it back`,
          checkOn: checkDate(range),
        },
        target: { kind: 'campaign', id: c.id, label: c.name },
        scope: [CHANNEL_LABEL[channel], c.name],
        channel,
        atStake: raise,
        compare: [t, restOf(ch, t)],
        effect: { spend: raise, leads: proj.extraLeads },
        ...(sized ? {} : { held: marginalHeld(floorMarginal(campaignRows(c.id, 90), week), chCac, `the ${CHANNEL_LABEL[channel]} average`) }),
        measure: { key: `campaign-leads:${c.id}`, label: 'Campaign leads', better: 'higher' },
        strength: Math.min(1, better / 0.4),
      });
    }
  }

  return out;
}

/**
 * Pacing against the monthly budget.
 *
 * TIER 1. Spend to date and a planned figure, divided. The one thing it must not
 * do is tell you to spend more because you are under — whether the remaining
 * budget is worth spending is a different question entirely.
 */
function pacing(range: Range, channels: ChannelName[], raised: Set<string> = new Set()): Candidate[] {
  /* 🐛 Scoped to the channels passed in, which it was NOT -- it read
     totals('all'), so an account with every channel off still produced a
     pacing finding. Found by the empty-account test. */
  if (channels.length === 0) return [];
  const planned = budgetForRange(range);
  if (planned <= 0) return [];

  const spent = blendedTotal('Spend', channels, range);
  const ratio = spent / planned;
  /* A 15% band either side. Inside it, pacing is not a finding. */
  if (ratio > 0.85 && ratio < 1.15) return [];

  const over = ratio >= 1.15;
  const off = Math.round(Math.abs(ratio - 1) * 100);
  const evidence = [
    { label: 'Spent', value: money(spent) },
    { label: 'Planned', value: money(planned) },
    { label: 'Pace', value: `${Math.round(ratio * 100)}%` },
  ];
  const base = {
    id: `pacing:${range}:${over ? 'over' : 'under'}`,
    kind: 'pacing' as DecisionKind,
    strength: Math.min(1, Math.abs(ratio - 1) / 0.5),
    measure: { key: 'pace:account', label: 'Pace to plan', better: 'closer-to-one' as const },
  };
  const checkOn = checkDate(7);
  const running = CAMPAIGNS
    .filter((c) => channels.includes(c.channel) && stageOf(c.id) === 'Active')
    .map((c) => ({ c, t: campaignTotals(c.id, range) }))
    .filter((x) => x.t.leads >= 20 && x.t.spend > 0);
  const totalLeads = channels.reduce((a, ch) => a + totals(ch, range).leads, 0);
  const blended = totalLeads > 0 ? spent / totalLeads : Infinity;

  /* ⭐ Sept 30: pacing says WHAT TO DO about the gap. "Review pacing" was a
     fact with a verb in front of it. */
  if (over) {
    /* Over plan: take the excess out of the dearest running campaign. Cutting
       needs no forecast, so this stays tier 1. */
    const dearest = [...running].sort((a, b) => b.t.cac - a.t.cac)[0];
    if (dearest) {
      const cut = Math.min(spent - planned, dearest.t.spend * 0.5);
      return [{
        ...base, tier: 1,
        action: `Cut ${money(cut)} from “${dearest.c.name}” — spend is ${off}% over plan`,
        because: `${money(spent)} spent of ${money(planned)} planned for ${range} days. `
          + `“${dearest.c.name}” pays ${cacText(dearest.t.cac)} a lead, the most of any running campaign.`,
        evidence,
        expectation: { outcome: `Brings spend to ${pct((spent - cut) / planned)} of plan.`, checkOn },
        target: { kind: 'campaign', id: dearest.c.id, label: dearest.c.name },
        scope: [CHANNEL_LABEL[dearest.c.channel], dearest.c.name],
        channel: dearest.c.channel,
        atStake: cut,
        effect: perWeek(cutEffect(campaignRows(dearest.c.id, 90), dearest.t, cut / dearest.t.spend), range),
      }];
    }
  } else {
    /* Under plan: put the gap where leads are cheapest -- a running campaign
       already cheaper than the account, and not one another card is raising.
       Adding money is a forecast, so this is tier 2 and says so. */
    /* ⭐ On the CURVE, not the average: the first campaign (cheapest first)
       whose extra money still pays less than the account average. A campaign
       at $33 a lead whose next dollar costs $43 is not where an account
       averaging $41 should put more. */
    const gap = planned - spent;
    const candidates = [...running]
      .filter((x) => x.t.cac <= blended && !raised.has(x.c.id))
      .sort((a, b) => a.t.cac - b.t.cac);
    for (const x of candidates) {
      const most = Math.min(gap, x.t.spend * 0.25) / x.t.spend;
      const proj = sizedRaise(campaignRows(x.c.id, 90), x.t, Math.max(0.05, Math.floor(most * 20) / 20), blended, `over ${range} days`);
      if (!proj) continue;
      const add = x.t.spend * proj.r;
      const account = { spend: spent, leads: totalLeads };
      return [{
        ...base, tier: 2,
        action: `Put ${money(add)} of the unspent budget into “${x.c.name}”`,
        because: `Spend is ${off}% under plan: ${money(spent)} of ${money(planned)} for ${range} days. `
          + `“${x.c.name}” pays ${cacText(x.t.cac)} a lead; the account averages ${cacText(blended)}.`,
        evidence,
        expectation: {
          outcome: `${proj.outcome} Closes ${pct(add / gap)} of the gap.`,
          assuming: `on ${pct(proj.r)} more budget, ${proj.assuming}`,
          checkOn,
        },
        target: { kind: 'campaign', id: x.c.id, label: x.c.name },
        scope: [CHANNEL_LABEL[x.c.channel], x.c.name],
        channel: x.c.channel,
        atStake: add,
        compare: [x.t, restOf(account, x.t)],
        effect: perWeek({ spend: add, leads: proj.extraLeads }, range),
      }];
    }
    if (candidates.length > 0) {
      /* ⭐ Cheap campaigns exist, but none can take more money for less than the
         account already pays: on their curves the next dollar is dearer. That
         IS the answer -- the unspent budget has no good home, so the plan is
         what is wrong. A decision, not a shrug. */
      const best = candidates[0];
      const step = onTheCurve(campaignRows(best.c.id, 90), best.t, 0.05, '');
      const floor = step.marginalCac;
      /* Tier 2: "the next dollar is dearer" rests on the curve, which may be
         the stated default rather than a measurement -- so it is said. */
      return [{
        ...base, tier: 2,
        action: `Lower the ${range}-day plan to ${money(spent)}`,
        because: `Spend is ${off}% under plan, and no running campaign can take more money for less `
          + `than the account’s ${cacText(blended)} a lead. The cheapest, “${best.c.name}”, `
          + `pays ${cacText(best.t.cac)} on average, but its next dollar would buy leads at about ${cacText(floor)}.`,
        evidence,
        expectation: {
          outcome: `Keeps ${money(gap)} out of spend that would cost more per lead than it is worth.`,
          assuming: `for “${best.c.name}”, ${step.assuming}`,
          checkOn,
        },
        target: { kind: 'account', id: 'account', label: 'All channels' },
        scope: ['All channels'],
      }];
    }
    if (running.length > 0) {
      /* Nothing cheap enough to push: the plan is what is wrong. */
      return [{
        ...base, tier: 1,
        action: `Lower the ${range}-day plan to ${money(spent)}`,
        because: `Spend is ${off}% under plan, and no running campaign is cheaper than the account’s `
          + `${cacText(blended)} average without already having more budget proposed.`,
        evidence,
        expectation: { outcome: 'The plan matches what the account spends, so pacing means something again.', checkOn },
        target: { kind: 'account', id: 'account', label: 'All channels' },
        scope: ['All channels'],
      }];
    }
  }

  /* No running campaign with figures: say the gap, and nothing more. */
  return [{
    ...base, tier: 1,
    action: `Bring spend back to plan — it is ${off}% ${over ? 'over' : 'under'}`,
    because: `${money(spent)} spent of ${money(planned)} planned for ${range} days.`,
    evidence,
    expectation: {
      outcome: over ? 'Spending back on plan, or the plan changed on purpose.'
        : 'Either the plan is wrong or the budget isn’t being spent. Both are worth knowing.',
      checkOn,
    },
    /* "All channels", the words the switcher, chat and export already use. */
    target: { kind: 'account', id: 'account', label: 'All channels' },
    scope: ['All channels'],
  }];
}

/**
 * 🚨 THE PODCAST TRAP, surfaced as a question rather than advice.
 *
 * This is the most important function in the file, and it is the one that
 * produces NO recommendation.
 *
 * The arithmetic is real and it is damning: podcasts cost several times what Meta
 * does per lead. Every instinct — and every naive engine — turns that into "cut
 * podcast spend." **This data cannot support that.** Podcasts and affiliates sit
 * high in the funnel; a last-touch model credits the channel nearest the
 * conversion, so the ad that created the demand is invisible and the ad that
 * harvested it looks efficient. Cutting the expensive channel is how an account
 * quietly kills the thing feeding the cheap one.
 *
 * ⚠️ So this reports the gap, names what is missing, and refuses to advise. The
 * refusal IS the feature. Anyone can compute the CAC difference; knowing it is not
 * a decision is the part that takes judgment.
 */
function crossChannelCostGap(range: Range, channels: ChannelName[]): Candidate[] {
  if (channels.length < 2) return [];

  const per = channels
    .map((c) => ({ c, t: totals(c, range) }))
    .filter((x) => x.t.leads > 0 && x.t.spend > 0)
    .map((x) => ({ ...x, cac: x.t.spend / x.t.leads }));
  if (per.length < 2) return [];

  const sorted = [...per].sort((a, b) => a.cac - b.cac);
  const cheap = sorted[0];
  const dear = sorted[sorted.length - 1];
  if (dear.cac < cheap.cac * 2) return [];

  const question: Candidate = {
    id: `causal-gap:${dear.c}:${cheap.c}`,
    tier: 3,
    kind: 'cross-channel-cost-gap',
    /* A QUESTION. Never "cut the expensive channel". */
    action: `Is ${CHANNEL_LABEL[dear.c]} spend creating demand that `
      + `${CHANNEL_LABEL[cheap.c]} is getting credit for?`,
    because: `${CHANNEL_LABEL[dear.c]} pays ${formatDerived('CAC', dear.cac)} a lead. `
      + `${CHANNEL_LABEL[cheap.c]} pays ${formatDerived('CAC', cheap.cac)}. `
      + `It looks like the channel to cut. But Growth only credits the last touch `
      + `before a sale, and that always favours the channel closest to it.`,
    evidence: [
      { label: `${CHANNEL_LABEL[dear.c]} CAC`, value: formatDerived('CAC', dear.cac) },
      { label: `${CHANNEL_LABEL[cheap.c]} CAC`, value: formatDerived('CAC', cheap.cac) },
      { label: 'Ratio', value: `${(dear.cac / cheap.cac).toFixed(1)}x` },
      { label: `${CHANNEL_LABEL[dear.c]} spend`, value: formatMetric('Spend', dear.t.spend) },
    ],
    /* No expectation. There is nothing to expect from a question, and inventing
       one would make this look like a recommendation. */
    needs: `An incrementality test: turn ${CHANNEL_LABEL[dear.c]} off in some regions `
      + `and see if ${CHANNEL_LABEL[cheap.c]} leads drop. Or give each channel its own `
      + `promo code. Growth has no attribution model to answer this.`,
    target: { kind: 'channel', id: dear.c, label: CHANNEL_LABEL[dear.c] },
    scope: [CHANNEL_LABEL[dear.c]],
    channel: dear.c,
    /* The GAP can be tested; its cause cannot. Confidence here says the gap is
       real -- which is exactly why it needs a holdout and not a guess. */
    compare: [dear.t, cheap.t],
    /* ⚠️ atStake deliberately OMITTED. The dear channel's spend is the biggest
       number this engine could attach to anything, and attaching it here is
       exactly how the least supportable finding climbs to the top of a list
       sorted by money. */
    strength: Math.min(1, (dear.cac / cheap.cac - 2) / 3),
  };

  /* ⭐ Sept 30 -- and the DECISION that answers it. Tommy: "what do you think
     they should do?" The question above stays a question: cutting the dear
     channel is exactly what this data cannot justify. But running the test that
     WOULD justify it (or clear it) is a decision with no forecast in it, so it
     is tier 1 and takeable. Graded by the person -- no number in this data can
     say how a test came out. */
  const D = CHANNEL_LABEL[dear.c];
  const C = CHANNEL_LABEL[cheap.c];
  const test: Candidate = {
    id: `holdout:${dear.c}:${cheap.c}`,
    tier: 1,
    kind: 'holdout-test',
    action: `Test ${D} before touching its budget: a 2-week regional holdout`,
    because: `${D} looks ${(dear.cac / cheap.cac).toFixed(1)}x dearer per lead than ${C}, but the `
      + `data only sees the last touch. Turn ${D} off in half your regions for two weeks and `
      + `compare ${C} leads across the two halves.`,
    evidence: [
      { label: `${D} CAC`, value: formatDerived('CAC', dear.cac) },
      { label: `${C} CAC`, value: formatDerived('CAC', cheap.cac) },
      { label: 'Test length', value: '2 weeks' },
      { label: 'Split', value: 'Half your regions' },
    ],
    expectation: {
      outcome: `If ${C} leads drop where ${D} is off, ${D} is feeding them — keep it. `
        + `If they hold, its budget is safe to move.`,
      checkOn: checkDate(14),
    },
    target: { kind: 'channel', id: dear.c, label: D },
    scope: [D],
    channel: dear.c,
    compare: [dear.t, cheap.t],
    strength: 0.55,
  };

  return [test, question];
}

/**
 * ⭐ THE SLOW LEAK -- what a week-over-week alert is built to miss.
 *
 * Notifications fire when a week moves past the threshold (15% by default).
 * A campaign whose cost per lead rises 6% a week never trips it: every single
 * week is "just a week", and after two months it is paying a third more per
 * lead than it was, with nobody told. The weekly-move detector cannot see it
 * either, because it reads the same alerts.
 *
 * So this looks across EIGHT weeks: the last four against the four before.
 * It fires when the recent four cost at least 15% more per lead, at least
 * three of those four weeks sit above the earlier average (a drift, not one
 * bad week), and the most recent week did NOT already raise an alert (that
 * one belongs to the weekly move). The two four-week blocks are what get
 * tested for chance.
 *
 * TIER 1: the action is a cut, and cutting needs no forecast -- the same rule
 * pacing uses. It does not say WHY (audience saturation, creative wear and a
 * competitor bidding up are all possible, and none is in this data); it says
 * how much to keep spending at the higher price, and the price to come back at.
 */
export function leakOf(weeks: Sample[]): { early: Sample; recent: Sample; rise: number } | null {
  if (weeks.length < 8) return null;
  const sum = (w: Sample[]) => w.reduce((a, x) => ({ spend: a.spend + x.spend, leads: a.leads + x.leads }), { spend: 0, leads: 0 });
  const early = sum(weeks.slice(0, 4));
  const recent = sum(weeks.slice(4, 8));
  if (early.leads <= 0 || recent.leads <= 0) return null;
  const earlyCac = early.spend / early.leads;
  const rise = (recent.spend / recent.leads) / earlyCac - 1;
  if (rise < 0.15) return null;
  const above = weeks.slice(4, 8).filter((w) => w.leads > 0 && w.spend / w.leads > earlyCac).length;
  if (above < 3) return null;
  return { early, recent, rise };
}

function slowLeak(channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];
  const news = changeThreshold() / 100;
  for (const c of CAMPAIGNS) {
    if (!channels.includes(c.channel) || stageOf(c.id) !== 'Active') continue;
    const rows = campaignRows(c.id, LAST_WEEK * 8);
    if (rows.length < LAST_WEEK * 8) continue;
    const weeks = Array.from({ length: 8 }, (_, i) => weekOf(rows.slice(i * 7, i * 7 + 7)));
    const leak = leakOf(weeks);
    if (!leak) continue;
    /* The last week on its own past the alert line? Then the weekly move has it. */
    const last = cacOf(weeks[7]); const before = cacOf(weeks[6]);
    if (Number.isFinite(last) && Number.isFinite(before) && Math.abs(last / before - 1) >= news) continue;

    const earlyCac = leak.early.spend / leak.early.leads;
    const recentCac = leak.recent.spend / leak.recent.leads;
    const weekly = leak.recent.spend / 4;
    const cut = weekly * 0.15;
    out.push({
      id: `leak:${c.id}`,
      tier: 1,
      kind: 'slow-leak',
      action: `Cut ${budgetOf(c.name, true)} 15% until a week comes in under ${cacText(earlyCac)}`,
      because: `Its cost per lead has crept from ${cacText(earlyCac)} to ${cacText(recentCac)} over `
        + `eight weeks (+${Math.round(leak.rise * 100)}%). No single week moved enough to raise an alert, `
        + `so nothing flagged it.`,
      evidence: [
        { label: 'CAC, 8–5 weeks ago', value: cacText(earlyCac) },
        { label: 'CAC, last 4 weeks', value: cacText(recentCac) },
        { label: 'Rise', value: `+${Math.round(leak.rise * 100)}%` },
        { label: 'Spend a week', value: money(weekly) },
      ],
      expectation: {
        outcome: `Saves about ${money(cut)} a week while each lead costs ${Math.round(leak.rise * 100)}% `
          + `more than two months ago. Put it back after a week under ${cacText(earlyCac)}.`,
        checkOn: checkDate(14),
      },
      target: { kind: 'campaign', id: c.id, label: c.name },
      scope: [CHANNEL_LABEL[c.channel], c.name],
      channel: c.channel,
      atStake: cut,
      compare: [leak.recent, leak.early],
      effect: cutEffect(campaignRows(c.id, 90), { spend: weekly, leads: leak.recent.leads / 4 }, 0.15),
      measure: { key: `campaign-cac:${c.id}`, label: 'Campaign CAC', better: 'lower' },
      strength: Math.min(1, 0.5 + leak.rise),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- assembly -- */

/**
 * Rejects malformed candidates rather than rendering them.
 *
 * The tier/assumption contract is the load-bearing claim of the whole feature,
 * so it is checked rather than trusted: a tier-2 candidate with no stated
 * assumption is a projection pretending to be a fact, and a tier-3 candidate
 * carrying an expectation is a question pretending to be advice. Both are worse
 * than showing nothing.
 */
export function validate(c: Candidate): string | null {
  if (c.tier === 2 && !c.expectation?.assuming) {
    return `tier 2 candidate "${c.id}" has no stated assumption`;
  }
  if (c.tier === 1 && c.expectation?.assuming) {
    return `tier 1 candidate "${c.id}" states an assumption — it should be tier 2`;
  }
  if (c.tier === 3 && c.expectation) {
    return `tier 3 candidate "${c.id}" carries an expectation — a question cannot promise an outcome`;
  }
  if (c.tier === 3 && !c.needs) {
    return `tier 3 candidate "${c.id}" does not say what would answer it`;
  }
  if (c.tier === 3 && c.atStake !== undefined) {
    return `tier 3 candidate "${c.id}" carries atStake — that is how the least supportable finding ranks first`;
  }
  return null;
}

/**
 * ⭐ THIS WEEK'S BIG MOVES, as things to act on.
 *
 * 🐛 The engine looked only at the selected window's shape -- pacing, ad
 * shares, missing variants -- and had no rule for "something just changed".
 * So Meta's cost per lead jumping 42% in a week sat on Notifications and the
 * Overview strip, and "what should I do next?" never mentioned it.
 *
 * Reads the SAME rules as the notification feed (`notifications()`), so the
 * two can never disagree about what counts as news.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 🚨 Sept 30 -- "FIND OUT WHY" WAS NOT A DECISION. Tommy: *"It's more of saying,
 * 'Hey, you go figure it out.' Based on the machine's decision-making, what do
 * you think they should do? That's what makes this product worth it."*
 *
 * He is right, and the rule it hid behind was misapplied. The data cannot say
 * WHY a number moved -- that still holds. But it can say WHERE (which ad, which
 * campaign carried the move: arithmetic, not inference) and it can say what a
 * careful buyer does next while the cause is unknown. Neither needs a cause:
 *
 *   cost rose, one ad stands out    → PAUSE that ad              (tier 1: frees spend)
 *   cost rose, nothing stands out   → CUT 20% until it recovers  (tier 1: limits exposure)
 *   leads fell because spend fell   → PUT the spend back         (tier 2: assumes last week's cost)
 *   leads rose / cost fell          → RAISE the campaign that led it 20%, with a
 *                                     stated point at which to pull back (tier 2)
 *
 * Every one names the thing, the amount, and the number that says undo it.
 */

/** The live ads under a channel or a campaign, with this week and last. */
function liveAds(target: Target, channel: ChannelName) {
  const campaigns = target.kind === 'campaign'
    ? CAMPAIGNS.filter((c) => c.id === target.id)
    : CAMPAIGNS.filter((c) => c.channel === channel && stageOf(c.id) === 'Active');
  return campaigns.flatMap((c) => creativesFor(c.id)
    .filter((a) => a.stage === 'Active')
    .map((a) => ({
      c, a,
      now: weekOf(creativeRows(a.id, LAST_WEEK)),
      prev: weekOf(creativeRows(a.id, LAST_WEEK, 1)),
    })));
}

function weeklyMove(channels: ChannelName[]): Candidate[] {
  return notifications(channels)
    .filter((n) => n.group === 'This week' && n.channel && n.change !== undefined && n.metric)
    .map((n): Candidate | null => {
      const ch = n.channel!;
      const isCampaign = n.target.kind === 'campaign';
      const name = isCampaign ? n.target.label : CHANNEL_LABEL[ch];
      const target: Target = isCampaign ? n.target : { kind: 'channel', id: ch, label: name };
      const scope = isCampaign ? [CHANNEL_LABEL[ch], name] : [name];
      const now = weekOf(isCampaign ? campaignRows(n.target.id, LAST_WEEK) : rowsFor(ch, LAST_WEEK));
      const prev = weekOf(isCampaign ? campaignRows(n.target.id, LAST_WEEK, 1) : rowsFor(ch, LAST_WEEK, 1));
      const nowCac = cacOf(now);
      const prevCac = cacOf(prev);
      const bad = n.tone === 'bad';
      const pctMoved = Math.abs(n.change!);
      const isCac = n.metric === 'CAC';

      /* The move itself, both weeks -- the first half of every "because". */
      const moved = isCac
        ? `${name}’s cost per lead went from ${cacText(prevCac)} to ${cacText(nowCac)} this week.`
        : `${name} brought in ${count(now.leads)} leads this week, against ${count(prev.leads)} the week before.`;

      /* The figures of the metric that MOVED come first. */
      const evidence: Evidence[] = isCac ? [
        { label: 'This week CAC', value: cacText(nowCac) },
        { label: 'Last week CAC', value: cacText(prevCac) },
        { label: 'Leads this week', value: count(now.leads) },
        { label: 'Change', value: `${n.change! > 0 ? '+' : ''}${n.change}% CAC` },
      ] : [
        { label: 'Leads this week', value: count(now.leads) },
        { label: 'Leads last week', value: count(prev.leads) },
        { label: 'CAC this week', value: cacText(nowCac) },
        { label: 'Change', value: `${n.change! > 0 ? '+' : ''}${n.change}% leads` },
      ];
      const base = {
        id: `weekly:${n.id}`,
        kind: 'weekly-move' as DecisionKind,
        channel: ch,
        atStake: now.spend,
        /* Ahead of the slow structural findings: this is what changed. */
        strength: Math.min(1, 0.7 + pctMoved / 100),
      };
      const checkOn = checkDate(LAST_WEEK);
      const leadsMeasure = isCampaign
        ? { key: `campaign-leads:${n.target.id}`, label: 'Campaign leads', better: 'higher' as const }
        : { key: `channel-leads:${ch}`, label: 'Channel leads', better: 'higher' as const };

      if (bad) {
        /* ── Fewer leads because LESS WENT OUT. Spend fell and the price did
           not rise: the fix is the budget, not the ads. */
        const spendFell = prev.spend > 0 && now.spend < prev.spend * 0.9;
        if (!isCac && spendFell && Number.isFinite(prevCac) && nowCac <= prevCac * 1.15) {
          const back = (prev.spend - now.spend) / prevCac;
          return {
            ...base, tier: 2,
            action: `Put ${budgetOf(name, isCampaign)} back to ${money(prev.spend)} a week`,
            because: `${moved} Spend fell with them, from ${money(prev.spend)} to ${money(now.spend)}, `
              + `while each lead cost about the same. Less went out, so less came back.`,
            evidence,
            expectation: {
              outcome: `About ${count(back)} leads a week back.`,
              assuming: `the restored spend buys leads at last week’s ${cacText(prevCac)}`,
              checkOn,
            },
            target, scope, measure: leadsMeasure,
            effect: { spend: prev.spend - now.spend, leads: back },
          };
        }

        /* ── Cost rose. If one live ad is clearly the dearest, pause it. */
        const floor = Math.max(100, now.spend * 0.03);
        const ads = liveAds(target, ch).filter((x) => x.now.spend >= floor);
        if (ads.length >= 2 && Number.isFinite(nowCac)) {
          const worst = ads.reduce((a, b) => (cacOf(b.now) > cacOf(a.now) ? b : a));
          const worstCac = cacOf(worst.now);
          if (worstCac >= nowCac * 1.3) {
            const restLeads = now.leads - worst.now.leads;
            const rest = restLeads > 0 ? (now.spend - worst.now.spend) / restLeads : undefined;
            return {
              ...base, tier: 1,
              action: `Pause ${adName(worst.a.headline, worst.a.adSetName)}`,
              because: `${moved} This ad paid ${Number.isFinite(worstCac) ? cacText(worstCac) : 'for no leads'}`
                + `${Number.isFinite(worstCac) ? ' a lead' : ''} — the most of any live ad on ${name}.`,
              evidence: [
                { label: 'This ad’s CAC', value: Number.isFinite(worstCac) ? cacText(worstCac) : 'No leads' },
                { label: `${name} CAC`, value: cacText(nowCac) },
                { label: 'Last week', value: cacText(prevCac) },
                { label: 'Its spend this week', value: money(worst.now.spend) },
              ],
              expectation: {
                outcome: `Frees ${money(worst.now.spend)} a week.`
                  + (rest !== undefined ? ` Without it, the rest of ${name} paid ${cacText(rest)} a lead this week.` : ''),
                checkOn,
              },
              target: { kind: 'ad', id: worst.a.id, label: worst.a.headline },
              scope: [CHANNEL_LABEL[ch], worst.c.name, worst.a.adSetName],
              atStake: worst.now.spend,
              compare: [worst.now, restOf(now, worst.now)],
              effect: { spend: -worst.now.spend, leads: -worst.now.leads },
              measure: { key: `campaign-cac:${worst.c.id}`, label: 'Campaign CAC', better: 'lower' },
            };
          }
        }

        /* ── Cost rose everywhere at once. Nothing to single out, so limit
           the exposure until a week comes back under the old price. */
        const cut = now.spend * 0.2;
        const rose = Number.isFinite(prevCac) && Number.isFinite(nowCac)
          ? Math.round((nowCac / prevCac - 1) * 100) : pctMoved;
        return {
          ...base, tier: 1,
          action: Number.isFinite(prevCac)
            ? `Cut ${budgetOf(name, isCampaign)} 20% until CAC is back under ${cacText(prevCac)}`
            : `Cut ${budgetOf(name, isCampaign)} 20% for a week`,
          because: `${moved} It rose across ${name} rather than in one ad, so there is nothing to `
            + `single out — only how much to keep spending at the higher price.`,
          evidence,
          expectation: {
            outcome: `Saves about ${money(cut)} a week while each lead costs ${rose}% more. `
              + `Put it back after a full week under ${cacText(prevCac)}.`,
            checkOn,
          },
          target, scope,
          compare: [now, prev],
          effect: cutEffect(isCampaign ? campaignRows(n.target.id, 90) : rowsFor(ch, 90), now, 0.2),
          measure: isCampaign
            ? { key: `campaign-cac:${n.target.id}`, label: 'Campaign CAC', better: 'lower' }
            : { key: `channel-cac:${ch}`, label: 'Channel CAC', better: 'lower' },
        };
      }

      /* ── Something worked. Give more to the campaign that led it, with the
         number that says pull back. */
      const pool = (isCampaign
        ? CAMPAIGNS.filter((c) => c.id === n.target.id)
        : CAMPAIGNS.filter((c) => c.channel === ch))
        .filter((c) => stageOf(c.id) === 'Active')
        .map((c) => ({ c, now: weekOf(campaignRows(c.id, LAST_WEEK)), prev: weekOf(campaignRows(c.id, LAST_WEEK, 1)) }))
        .filter((x) => x.now.leads > 0);
      if (pool.length === 0) return null;
      const lead = pool.reduce((a, b) => {
        const da = a.now.leads - a.prev.leads;
        const db = b.now.leads - b.prev.leads;
        return db > da || (db === da && cacOf(b.now) < cacOf(a.now)) ? b : a;
      });
      const cac = cacOf(lead.now);
      /* The pull-back line: last week's cost if it was worse, else 15% over
         this week's. Never Infinity -- a week with no leads is no benchmark. */
      const stop = Number.isFinite(cacOf(lead.prev)) ? Math.max(cacOf(lead.prev), cac * 1.15) : cac * 1.15;
      /* Sized so the extra money stays under the pull-back line it names. */
      const sized = sizedRaise(campaignRows(lead.c.id, 90), lead.now, 0.2, stop, 'a week');
      const proj = sized ?? onTheCurve(campaignRows(lead.c.id, 90), lead.now, 0.2, 'a week');
      const raise = lead.now.spend * proj.r;
      const who = isCampaign ? ''
        : pool.length === 1 && CAMPAIGNS.filter((c) => c.channel === ch && stageOf(c.id) === 'Active').length === 1
          ? ` It all ran through \u201c${lead.c.name}\u201d, at ${cacText(cac)} a lead.`
          : ` \u201c${lead.c.name}\u201d led it: ${count(lead.now.leads)} leads at ${cacText(cac)} each, `
            + `up from ${count(lead.prev.leads)}.`;
      return {
        ...base, tier: 2,
        action: `Raise ${budgetOf(lead.c.name, true)} ${pct(proj.r)} (+${money(raise)} a week)`,
        because: `${moved}${who}`,
        evidence,
        expectation: {
          outcome: proj.outcome,
          assuming: `${proj.assuming}. If a week comes in above ${cacText(stop)}, put the budget back`,
          checkOn,
        },
        target: { kind: 'campaign', id: lead.c.id, label: lead.c.name },
        scope: [CHANNEL_LABEL[ch], lead.c.name],
        atStake: raise,
        /* The claim is "leads rose" -- tested as two counts over equal weeks. */
        compare: [{ spend: 1, leads: lead.now.leads }, { spend: 1, leads: lead.prev.leads }],
        effect: { spend: raise, leads: proj.extraLeads },
        ...(sized ? {} : { held: marginalHeld(floorMarginal(campaignRows(lead.c.id, 90), lead.now), stop, 'its pull-back line') }),
        measure: { key: `campaign-leads:${lead.c.id}`, label: 'Campaign leads', better: 'higher' },
      };
    })
    .filter((c): c is Candidate => c !== null);
}

/**
 * Every candidate the data supports, best-supported first.
 *
 * ⭐ Sorted by TIER, then strength. **Never by `atStake`.** Sorting by money puts
 * the causal question — the one carrying a whole channel's budget — at the top of
 * the list, which is the exact failure this module exists to prevent.
 */
export function decisions(
  range: Range = 30,
  channels: ChannelName[] = activeChannels(),
): Candidate[] {
  /* ⭐ Memoised on EVERYTHING the engine reads. It was recomputed on every
     render -- 70-115 ms on a 1,200-ad account, several times per screen (the
     page, the sidebar count, Ask). A cache with a missing input is worse than
     no cache: it shows yesterday's decisions with today's numbers. So the key
     lists every input, and decisionCache.test.ts changes each one and asserts
     the result moves. A copy is returned so no caller can edit the cache. */
  const key = [
    range, channels.join(','), dataVersion(), windowEnd(), structureVersion(),
    stageFingerprint(), budgetForRange(30), JSON.stringify(channelBudgets()), changeThreshold(),
    checkDate(0), CAMPAIGNS.length,
  ].join('|');
  if (memo && memo.key === key) return [...memo.value];
  const value = compute(range, channels);
  memo = { key, value, held: HELD };
  return [...value];
}

let memo: { key: string; value: Candidate[]; held: Candidate[] } | null = null;
let HELD: Candidate[] = [];

/**
 * Findings the engine found and did NOT show, because the gap behind them
 * could be chance. Same inputs as `decisions()`.
 */
export function heldBack(range: Range = 30, channels: ChannelName[] = activeChannels()): Candidate[] {
  decisions(range, channels);
  return [...(memo?.held ?? [])];
}

/** Forget the cached result. Tests only -- every real input is in the key. */
export function clearDecisionCache(): void { memo = null; }

function compute(range: Range, channels: ChannelName[]): Candidate[] {
  /* The ad ranking, ONCE -- four detectors read it. Built four times it was
     ~42 of 70ms on a 1,200-ad account at a year's range. */
  const ranked = rankedAds('Leads', 'absolute', range, channels);
  const found = [
    ...weeklyMove(channels),
    ...spendReturnMismatch(range, channels, ranked),
    ...pausedWinner(range, channels, ranked),
    ...scaleWinner(range, channels, ranked),
    ...reallocateWithinChannel(range, channels),
    ...staleReview(range, channels),
    ...noVariant(range, channels),
    ...beatsItsChannel(range, channels),
    ...concentrationRisk(range, channels, ranked),
    ...crossChannelCostGap(range, channels),
    ...slowLeak(channels),
  ];
  /* Pacing LAST, so it puts unspent budget somewhere no other card is already
     raising -- two cards adding money to one campaign is one decision twice. */
  const raised = new Set(found
    .filter((c) => c.target.kind === 'campaign' && /^Raise /.test(c.action))
    .map((c) => c.target.id));
  const all = [...found, ...pacing(range, channels, raised)];

  /* A malformed candidate is dropped, not rendered. In dev it complains, because
     silently showing fewer decisions than the engine found is the kind of thing
     that goes unnoticed for a month. */
  const ok = all.filter((c) => {
    const err = validate(c);
    if (err && import.meta.env?.DEV) console.warn(`[decisions] ${err}`);
    return !err;
  });

  /* ⭐ "IS THAT REAL?" -- asked of every claim that compares two things.
     A finding the data cannot tell apart from chance is HELD BACK, not shown
     with a small-print caveat: a recommendation is an instruction to move
     money, and moving money on a coin flip is the failure a decision engine
     exists to prevent. Held-back findings are kept (`heldBack()`), so the
     screen can say how many there are and why. Tier 3 is a question and is
     never held back -- a question is not acted on. Medium confidence ranks
     below high within its tier. */
  for (const c of ok) {
    if (c.compare) c.confidence = rateTest(c.compare[0], c.compare[1]);
    if (c.confidence?.level === 'medium') c.strength *= 0.75;
    if (!c.held && c.tier !== 3 && c.confidence?.level === 'low') {
      c.held = { reason: 'chance', sentence: c.confidence.sentence };
    }
  }
  const held = ok.filter((c) => c.held);
  HELD = held;
  const sure = ok.filter((c) => !held.includes(c));

  const sorted = sure.sort((a, b) =>
    (a.tier - b.tier)
    || (b.strength - a.strength)
    /* A TOTAL order, so the queue cannot reshuffle between renders. */
    || a.id.localeCompare(b.id));

  /* ⭐ Now that findings END in actions, two detectors can reach the same one:
     the weekly move and the spend share can both say "Pause this ad"; the
     weekly move and "beats its channel" can both raise one campaign. One
     action, one card -- the better-supported one, which is why this runs
     AFTER the sort. And nothing inside a campaign the engine says to END:
     pausing an ad in a campaign you are closing is the same money twice. */
  const ending = new Set(sorted
    .filter((c) => c.kind === 'stale-review' && /^End /.test(c.action))
    .map((c) => c.target.id));
  const seen = new Set<string>();
  return sorted.filter((c) => {
    if (c.target.kind === 'ad' && ending.has(creativeById(c.target.id)?.campaignId ?? '')) return false;
    if (c.target.kind === 'campaign' && c.kind !== 'stale-review' && ending.has(c.target.id)) return false;
    const key = `${c.action.split(' ')[0]}|${c.target.kind}|${c.target.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Findings that touch one specific thing the user pointed at.
 *
 * ⭐ THE ENGINE PUSHES; THIS MAKES IT PULL. `decisions()` decides what is worth
 * raising and the Decisions screen shows that agenda. But a marketer looking at a
 * row is not asking "what should I do" — they are asking *"what is going on with
 * THIS?"*, and an agenda cannot answer a question it did not anticipate.
 *
 * Same engine, same tiers, same arithmetic. The only difference is who chose the
 * subject. That matters because the alternative — a separate "explain this entity"
 * path — would be a second source of judgement that could disagree with the first,
 * and the user would have no way to tell which one to believe.
 *
 * ⚠️ Matches on the TARGET and on the channel, because a finding about a channel
 * is relevant when you are looking at one of its campaigns. Asking about Paid
 * Search should surface the ad-level pause inside it, not just findings whose
 * target id happens to equal `paidSearch`.
 */
export function decisionsFor(
  target: { kind: Target['kind']; id: string },
  range: Range = 30,
  channels: ChannelName[] = activeChannels(),
  /* Already computed? Pass it -- ask() used to run the whole engine twice. */
  all: Candidate[] = decisions(range, channels),
): Candidate[] {
  return all.filter((c) => {
    if (c.target.kind === target.kind && c.target.id === target.id) return true;
    /* A channel question inherits everything running on that channel. */
    if (target.kind === 'channel' && c.channel === target.id) return true;
    /* And an account-level question inherits the pacing finding, which targets
       the account rather than anything inside it. */
    if (target.kind === 'account' && c.target.kind === 'account') return true;
    return false;
  });
}

/**
 * What this data cannot say about one specific thing.
 *
 * Separate from the findings, because "here is what I know" and "here is what I
 * cannot know" are different answers and running them together is how a caveat
 * gets skimmed past. Returned as sentences rather than a flag, so the agent can
 * say them.
 */
export function limitsFor(kind: Target['kind']): string[] {
  const universal = [
    'why a number moved — there is no campaign log, no creative history and no record of what changed when',
    'what someone saw before they converted — this is last-touch only',
  ];
  if (kind === 'channel') {
    return [
      ...universal,
      'whether this channel is creating demand another one is getting credit for — that needs an incrementality test',
    ];
  }
  if (kind === 'ad') {
    return [
      ...universal,
      'whether this creative is fatiguing — that needs frequency and reach, which this data does not carry',
    ];
  }
  return universal;
}

/**
 * The figures for whatever the reader was looking at.
 *
 * ⭐ A decision written in the panel is written ABOUT something — the subject the
 * answer was scoped to. That context exists at the moment it is typed and was
 * being discarded, which is why a written card rendered as a bare line of text
 * beside engine cards carrying a breadcrumb and four figures.
 *
 * "There is nothing to check it against" was true of the CLAIM and false of the
 * CONTEXT. The reader's sentence cannot be verified; the numbers they were
 * looking at when they wrote it absolutely can, and they belong on the card.
 */
export function figuresFor(
  target: { kind: Target['kind']; id: string },
  range: Range = 30,
): { scope: string[]; channel?: ChannelName; evidence: Evidence[] } {
  if (target.kind === 'campaign') {
    const c = CAMPAIGNS.find((x) => x.id === target.id);
    if (c) {
      const t = campaignTotals(c.id, range);
      return {
        scope: [CHANNEL_LABEL[c.channel], c.name],
        channel: c.channel,
        evidence: [
          { label: 'Spend', value: formatMetric('Spend', t.spend) },
          { label: 'Leads', value: Math.round(t.leads).toLocaleString() },
          { label: 'CAC', value: formatDerived('CAC', t.cac) },
          { label: 'ROAS', value: formatDerived('ROAS', t.roas) },
        ],
      };
    }
  }

  if (target.kind === 'channel') {
    const ch = target.id as ChannelName;
    const t = totals(ch, range);
    return {
      scope: [CHANNEL_LABEL[ch]],
      channel: ch,
      evidence: [
        { label: 'Spend', value: formatMetric('Spend', t.spend) },
        { label: 'Leads', value: Math.round(t.leads).toLocaleString() },
        { label: 'CAC', value: formatDerived('CAC', t.cac) },
        { label: 'ROAS', value: formatDerived('ROAS', t.roas) },
      ],
    };
  }

  const t = totals('all', range);
  return {
    scope: ['All channels'],
    evidence: [
      { label: 'Spend', value: formatMetric('Spend', t.spend) },
      { label: 'Leads', value: Math.round(t.leads).toLocaleString() },
      { label: 'Blended CAC', value: formatDerived('CAC', t.cac) },
      { label: 'Blended ROAS', value: formatDerived('ROAS', t.roas) },
    ],
  };
}

/** Grouped for display, since the surface shows tiers as sections. */
export function decisionsByTier(
  range: Range = 30,
  channels: ChannelName[] = activeChannels(),
): Record<Tier, Candidate[]> {
  const all = decisions(range, channels);
  return {
    1: all.filter((c) => c.tier === 1),
    2: all.filter((c) => c.tier === 2),
    3: all.filter((c) => c.tier === 3),
  };
}

/**
 * What a decision on the queue is ABOUT -- where "Go to" takes you.
 *
 * ⭐ Three sources, in order of trust:
 *   1. The target stored on the flag when it was decided. Survives the engine
 *      no longer proposing it.
 *   2. The live candidate with that id -- for decisions taken before targets
 *      were stored.
 *   3. The captured channel, for an old written decision that has only that.
 * Undefined only when none of them exist; the card then offers no link rather
 * than one to the wrong place.
 */
export function targetOfDecision(
  flag: { refId: string; target?: Target; channel?: string },
  candidates: Candidate[],
): Target | undefined {
  if (flag.target) return flag.target;
  const live = candidates.find((c) => c.id === flag.refId);
  if (live) return live.target;
  if (flag.channel && flag.channel in CHANNEL_LABEL) {
    return { kind: 'channel', id: flag.channel, label: CHANNEL_LABEL[flag.channel as ChannelName] };
  }
  return undefined;
}
