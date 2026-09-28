import type { ChannelName } from '../styles/tokens';
import { CAMPAIGNS } from './campaigns';
import { campaignTotals } from './campaignSeries';
import { stageOf } from './campaignStatus';
import { rankedAds } from './adRanking';
import { CHANNEL_DEPTH } from './channelDepth';
import { formatDerived } from './channelMetrics';
import { budgetForRange } from './profile';
import {
  CHANNEL_LABEL, activeChannels, formatMetric, totals, type Range,
} from './metrics';
import { blendedTotal } from './blended';

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
  | 'concentration-risk'
  | 'pacing'
  | 'cross-channel-cost-gap';

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
  channel?: ChannelName;
  /**
   * Dollars in play. **For display only — never for ranking.**
   * Ranking by this is precisely how the podcast trap reaches the top.
   */
  atStake?: number;
  /** Within-tier ordering: how strong the finding is, 0–1. Not money. */
  strength: number;
}

/* ---------------------------------------------------------------- helpers -- */

function checkDate(range: Range, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + range);
  return d.toISOString().slice(0, 10);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
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
function spendReturnMismatch(range: Range, channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = rankedAds('Leads', 'absolute', range, channels);

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
        action: `Pause “${a.creative.headline}”`,
        because: `It takes ${pct(sShare)} of ${c.name}’s spend and returns ${pct(lShare)} of its leads.`,
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
            + `Campaign CAC improves if the remaining ads hold their current rates.`,
          checkOn: checkDate(range),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        channel: a.channel,
        atStake: a.totals.spend,
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
function scaleWinner(range: Range, channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = rankedAds('Leads', 'absolute', range, channels);

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
      out.push({
        id: `scale:${a.creative.id}`,
        tier: 2,
        kind: 'scale-winner',
        action: `Increase budget on “${a.creative.headline}”`,
        because: `It returns ${pct(lShare)} of ${c.name}’s leads on ${pct(sShare)} of its spend.`,
        evidence: [
          { label: 'Share of campaign leads', value: pct(lShare) },
          { label: 'Share of campaign spend', value: pct(sShare) },
          { label: 'Its CAC', value: formatDerived('CAC', cac) },
          { label: `${c.name} CAC`, value: formatDerived('CAC', spend / leads) },
        ],
        expectation: {
          outcome: `A 25% budget increase — about ${formatMetric('Spend', a.totals.spend * 0.25)} — `
            + `would buy roughly ${Math.round((a.totals.spend * 0.25) / cac)} more leads.`,
          /* The condition that makes this tier 2. Stated, not implied. */
          assuming: `its CAC of ${formatDerived('CAC', cac)} holds at the higher budget — `
            + `it usually rises as an audience is exhausted`,
          checkOn: checkDate(range),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        channel: a.channel,
        atStake: a.totals.spend * 0.25,
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
 * TIER 1, because the claim is purely historical arithmetic: *while it ran, this
 * is what it returned.* It deliberately does NOT say "turn it back on" — that
 * would be a forecast, and a forecast belongs in tier 2. It says review, and it
 * says why.
 *
 * ⚠️ And it states the limitation on the card. A paused ad's figures in this
 * dataset still cover the whole window, because the data layer has no per-ad
 * start and stop dates. So the numbers describe the period, not the ad's live
 * span, and the card says so rather than letting a reader assume otherwise.
 */
function pausedWinner(range: Range, channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = rankedAds('Leads', 'absolute', range, channels);

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
        tier: 1,
        kind: 'paused-winner',
        action: `Review why “${a.creative.headline}” is paused`,
        because: `While it ran it returned ${pct(lShare)} of ${c.name}’s leads on `
          + `${pct(sShare)} of its spend, at ${formatDerived('CAC', cac)} a lead against the `
          + `campaign’s ${formatDerived('CAC', spend / leads)} — and the campaign is still active.`,
        evidence: [
          { label: 'Status', value: 'Paused' },
          { label: 'Share of campaign leads', value: pct(lShare) },
          { label: 'Share of campaign spend', value: pct(sShare) },
          { label: 'Its CAC', value: formatDerived('CAC', cac) },
          /* Said on the card, not buried in a doc. */
          { label: 'Caveat', value: 'Figures cover the full period, not its live span' },
        ],
        expectation: {
          /* No assumption, so it stays tier 1 — which is only possible because
             the action is "review", not "scale". Turning it back on would be a
             forecast about future performance and belongs in tier 2. */
          outcome: 'Either it goes back on, or the reason it was stopped gets written down. '
            + 'Right now neither has happened.',
          checkOn: checkDate(7),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        channel: a.channel,
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
    const gained = move / bestCac;
    const lost = move / worstCac;

    out.push({
      id: `realloc:${channel}:${worst.c.id}:${best.c.id}`,
      tier: 2,
      kind: 'reallocate-within-channel',
      action: `Shift ${formatMetric('Spend', move)} from “${worst.c.name}” to “${best.c.name}”`,
      because: `Both run on ${CHANNEL_LABEL[channel]}, so they are measured the same way. `
        + `${worst.c.name} costs ${formatDerived('CAC', worstCac)} a lead against `
        + `${formatDerived('CAC', bestCac)}.`,
      evidence: [
        { label: `${worst.c.name} CAC`, value: formatDerived('CAC', worstCac) },
        { label: `${best.c.name} CAC`, value: formatDerived('CAC', bestCac) },
        { label: 'Gap', value: `${Math.round(((worstCac - bestCac) / bestCac) * 100)}%` },
        { label: 'Proposed move', value: formatMetric('Spend', move) },
      ],
      expectation: {
        outcome: `About ${Math.round(gained - lost)} additional leads over ${range} days `
          + `— ${Math.round(gained)} gained against ${Math.round(lost)} given up.`,
        assuming: `${best.c.name} holds ${formatDerived('CAC', bestCac)} on `
          + `${Math.round((move / best.t.spend) * 100)}% more budget`,
        checkOn: checkDate(range),
      },
      target: { kind: 'campaign', id: worst.c.id, label: worst.c.name },
      channel,
      atStake: move,
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
function staleReview(channels: ChannelName[]): Candidate[] {
  return CAMPAIGNS
    .filter((c) => channels.includes(c.channel) && stageOf(c.id) === 'Review')
    .map((c) => ({
      id: `review:${c.id}`,
      tier: 1 as Tier,
      kind: 'stale-review' as DecisionKind,
      action: `Decide on “${c.name}” — it is in Review`,
      because: `Review means it is waiting on a person. Nothing about it changes until someone rules.`,
      evidence: [
        { label: 'Stage', value: 'Review' },
        { label: 'Channel', value: CHANNEL_LABEL[c.channel] },
        { label: 'Objective', value: c.objective },
      ],
      expectation: {
        outcome: 'Moves to Active or Ended. Either is progress; Review is not a resting state.',
        checkOn: checkDate(7),
      },
      target: { kind: 'campaign' as const, id: c.id, label: c.name },
      channel: c.channel,
      /* No atStake. Attaching a dollar figure would rank a decision that costs
         nothing to make alongside ones that move money. */
      strength: 0.5,
    }));
}

/**
 * One ad carrying an outsized share of a whole channel's leads.
 *
 * TIER 1 as a statement of concentration. Note what it does NOT say: it does not
 * claim the ad will fatigue, because frequency data is not in this dataset. It
 * says the channel has a single point of failure, which is arithmetic.
 */
function concentrationRisk(range: Range, channels: ChannelName[]): Candidate[] {
  const out: Candidate[] = [];
  const ads = rankedAds('Leads', 'absolute', range, channels);

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
      because: `One ${noun} — “${top.creative.headline}” — produces ${pct(share)} of `
        + `${CHANNEL_LABEL[channel]}’s leads across ${mine.length} live assets.`,
      evidence: [
        { label: `Top ${noun}’s share of channel leads`, value: pct(share) },
        { label: `${CHANNEL_LABEL[channel]} assets`, value: String(mine.length) },
        { label: 'Its leads', value: Math.round(top.totals.leads).toLocaleString() },
        { label: 'Channel leads', value: Math.round(leads).toLocaleString() },
      ],
      expectation: {
        outcome: `Reduces single-asset dependence. If this ${noun} stops working, `
          + `${pct(share)} of ${CHANNEL_LABEL[channel]}’s leads go with it.`,
        checkOn: checkDate(range),
      },
      target: { kind: 'channel', id: channel, label: CHANNEL_LABEL[channel] },
      channel,
      strength: Math.min(1, (share - 0.45) / 0.4),
    });
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
function pacing(range: Range, channels: ChannelName[]): Candidate[] {
  /* 🐛 Scoped to the channels passed in, which it was NOT.

     It read totals('all'), which resolves through activeChannels() rather than
     the list handed to it -- so an account with every channel switched off still
     produced a pacing finding, and a caller asking about one channel got the
     whole account's pace back under that channel's name. Found by the
     empty-account test, which is what that test is for. */
  if (channels.length === 0) return [];
  const planned = budgetForRange(range);
  if (planned <= 0) return [];

  const spent = blendedTotal('Spend', channels, range);
  const ratio = spent / planned;
  /* A 15% band either side. Inside it, pacing is not a finding. */
  if (ratio > 0.85 && ratio < 1.15) return [];

  const over = ratio >= 1.15;
  return [{
    id: `pacing:${range}:${over ? 'over' : 'under'}`,
    tier: 1,
    kind: 'pacing',
    action: over
      ? `Review pacing — spend is ${Math.round((ratio - 1) * 100)}% above plan`
      : `Review pacing — spend is ${Math.round((1 - ratio) * 100)}% below plan`,
    because: `${formatMetric('Spend', spent)} spent against ${formatMetric('Spend', planned)} planned `
      + `for ${range} days.`,
    evidence: [
      { label: 'Spent', value: formatMetric('Spend', spent) },
      { label: 'Planned', value: formatMetric('Spend', planned) },
      { label: 'Pace', value: `${Math.round(ratio * 100)}%` },
    ],
    expectation: {
      outcome: over
        ? 'Brings the month back onto plan, or the plan gets revised deliberately rather than by drift.'
        : 'Either the plan is wrong or the budget is not being deployed. Both are worth naming.',
      checkOn: checkDate(7),
    },
    target: { kind: 'account', id: 'account', label: 'This account' },
    strength: Math.min(1, Math.abs(ratio - 1) / 0.5),
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

  return [{
    id: `causal-gap:${dear.c}:${cheap.c}`,
    tier: 3,
    kind: 'cross-channel-cost-gap',
    /* A QUESTION. Never "cut the expensive channel". */
    action: `Is ${CHANNEL_LABEL[dear.c]} spend creating demand that `
      + `${CHANNEL_LABEL[cheap.c]} is getting credit for?`,
    because: `${CHANNEL_LABEL[dear.c]} costs ${formatDerived('CAC', dear.cac)} a lead against `
      + `${CHANNEL_LABEL[cheap.c]}’s ${formatDerived('CAC', cheap.cac)}. `
      + `The obvious read is to cut it — but this dashboard measures last touch, `
      + `which always flatters whichever channel sits closest to the conversion.`,
    evidence: [
      { label: `${CHANNEL_LABEL[dear.c]} CAC`, value: formatDerived('CAC', dear.cac) },
      { label: `${CHANNEL_LABEL[cheap.c]} CAC`, value: formatDerived('CAC', cheap.cac) },
      { label: 'Ratio', value: `${(dear.cac / cheap.cac).toFixed(1)}x` },
      { label: `${CHANNEL_LABEL[dear.c]} spend`, value: formatMetric('Spend', dear.t.spend) },
    ],
    /* No expectation. There is nothing to expect from a question, and inventing
       one would make this look like a recommendation. */
    needs: `An incrementality test — hold ${CHANNEL_LABEL[dear.c]} dark in some `
      + `geos and watch whether ${CHANNEL_LABEL[cheap.c]} volume falls — or `
      + `channel-specific promo codes and vanity URLs. Growth has no attribution `
      + `model, no campaign log and no view of what a user saw before converting.`,
    target: { kind: 'channel', id: dear.c, label: CHANNEL_LABEL[dear.c] },
    channel: dear.c,
    /* ⚠️ atStake deliberately OMITTED. The dear channel's spend is the biggest
       number this engine could attach to anything, and attaching it here is
       exactly how the least supportable finding climbs to the top of a list
       sorted by money. */
    strength: Math.min(1, (dear.cac / cheap.cac - 2) / 3),
  }];
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
  const all = [
    ...spendReturnMismatch(range, channels),
    ...pausedWinner(range, channels),
    ...scaleWinner(range, channels),
    ...reallocateWithinChannel(range, channels),
    ...staleReview(channels),
    ...concentrationRisk(range, channels),
    ...pacing(range, channels),
    ...crossChannelCostGap(range, channels),
  ];

  /* A malformed candidate is dropped, not rendered. In dev it complains, because
     silently showing fewer decisions than the engine found is the kind of thing
     that goes unnoticed for a month. */
  const ok = all.filter((c) => {
    const err = validate(c);
    if (err && import.meta.env?.DEV) console.warn(`[decisions] ${err}`);
    return !err;
  });

  return ok.sort((a, b) =>
    (a.tier - b.tier)
    || (b.strength - a.strength)
    /* A TOTAL order, so the queue cannot reshuffle between renders. */
    || a.id.localeCompare(b.id));
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
): Candidate[] {
  const all = decisions(range, channels);

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
