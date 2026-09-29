import type { ChannelName } from '../styles/tokens';
import { CAMPAIGNS } from './campaigns';
import { campaignRows, campaignTotals } from './campaignSeries';
import { stageOf } from './campaignStatus';
import { rankedAds } from './adRanking';
import { creativesFor } from './creative';
import { CHANNEL_DEPTH } from './channelDepth';
import { formatDerived } from './channelMetrics';
import { budgetForRange } from './profile';
import {
  CHANNEL_LABEL, LAST_WEEK, activeChannels, formatMetric, rowsFor, totals, type Range,
} from './metrics';
import { blendedTotal } from './blended';
import { notifications } from './notifications';

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
  | 'weekly-move';

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
        action: `Pause ${adName(a.creative.headline, a.creative.adSetName)}`,
        because: `It gets ${pct(sShare)} of ${c.name}’s spend but brings in only ${pct(lShare)} of its leads.`,
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
        action: `Increase budget on ${adName(a.creative.headline, a.creative.adSetName)}`,
        because: `It brings in ${pct(lShare)} of ${c.name}’s leads on just ${pct(sShare)} of its spend.`,
        evidence: [
          { label: 'Share of campaign leads', value: pct(lShare) },
          { label: 'Share of campaign spend', value: pct(sShare) },
          { label: 'Its CAC', value: formatDerived('CAC', cac) },
          { label: `${c.name} CAC`, value: formatDerived('CAC', spend / leads) },
        ],
        expectation: {
          outcome: `Raising its budget 25% (about ${formatMetric('Spend', a.totals.spend * 0.25)}) `
            + `should buy about ${Math.round((a.totals.spend * 0.25) / cac)} more leads.`,
          /* The condition that makes this tier 2. Stated, not implied. */
          assuming: `its ${formatDerived('CAC', cac)} CAC holds at the higher budget. `
            + `It usually rises as the audience gets used up`,
          checkOn: checkDate(range),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        scope: [CHANNEL_LABEL[a.channel], c.name, a.creative.adSetName],
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
        action: `Review why ${adName(a.creative.headline, a.creative.adSetName)} is paused`,
        because: `When it ran, it brought in ${pct(lShare)} of ${c.name}’s leads on `
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
          /* No assumption, so it stays tier 1 — which is only possible because
             the action is "review", not "scale". Turning it back on would be a
             forecast about future performance and belongs in tier 2. */
          outcome: 'It goes back on, or someone writes down why it stopped. '
            + 'Neither has happened yet.',
          checkOn: checkDate(7),
        },
        target: { kind: 'ad', id: a.creative.id, label: a.creative.headline },
        scope: [CHANNEL_LABEL[a.channel], c.name, a.creative.adSetName],
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
        assuming: `${best.c.name} holds ${formatDerived('CAC', bestCac)} on `
          + `${Math.round((move / best.t.spend) * 100)}% more budget`,
        checkOn: checkDate(range),
      },
      target: { kind: 'campaign', id: worst.c.id, label: worst.c.name },
      scope: [CHANNEL_LABEL[channel], worst.c.name],
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
      because: `It is waiting on a person. Nothing changes until someone approves or ends it.`,
      evidence: [
        { label: 'Stage', value: 'Review' },
        { label: 'Channel', value: CHANNEL_LABEL[c.channel] },
        { label: 'Objective', value: c.objective },
      ],
      expectation: {
        outcome: 'It moves to Active or Ended. Either one is progress.',
        checkOn: checkDate(7),
      },
      target: { kind: 'campaign' as const, id: c.id, label: c.name },
      scope: [CHANNEL_LABEL[c.channel], c.name],
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
      because: `One ${noun}, “${top.creative.headline}”, brings in ${pct(share)} of `
        + `${CHANNEL_LABEL[channel]}’s leads. There are ${mine.length} live assets.`,
      evidence: [
        { label: `Top ${noun}’s share of channel leads`, value: pct(share) },
        { label: `${CHANNEL_LABEL[channel]} assets`, value: String(mine.length) },
        { label: 'Its leads', value: Math.round(top.totals.leads).toLocaleString() },
        { label: 'Channel leads', value: Math.round(leads).toLocaleString() },
      ],
      expectation: {
        outcome: `If this ${noun} stops working, ${pct(share)} of `
          + `${CHANNEL_LABEL[channel]}’s leads go with it. A second one spreads the risk.`,
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
 * The action is to find out WHY, not to scale it. Scaling is a forecast.
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

      out.push({
        id: `beats-channel:${c.id}`,
        tier: 1,
        kind: 'beats-its-channel',
        action: `Find out why \u201c${c.name}\u201d beats ${CHANNEL_LABEL[channel]}`,
        /* Names the channel rather than saying "the channel". The card can be
           scanned without reading the action above it, and "the channel's
           $85.98" leaves the reader to work out which channel that was. */
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
          outcome: `Find out what it does differently (audience, creative, match type) `
            + `before copying it anywhere else.`,
          checkOn: checkDate(range),
        },
        target: { kind: 'campaign', id: c.id, label: c.name },
        scope: [CHANNEL_LABEL[channel], c.name],
        channel,
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
    because: `${formatMetric('Spend', spent)} spent of ${formatMetric('Spend', planned)} planned `
      + `for ${range} days.`,
    evidence: [
      { label: 'Spent', value: formatMetric('Spend', spent) },
      { label: 'Planned', value: formatMetric('Spend', planned) },
      { label: 'Pace', value: `${Math.round(ratio * 100)}%` },
    ],
    expectation: {
      outcome: over
        ? 'Bring spending back on plan, or change the plan on purpose.'
        : 'Either the plan is wrong or the budget isn’t being spent. Both are worth knowing.',
      checkOn: checkDate(7),
    },
    /* The account is a scope, not the absence of one. Saying so beats an empty
       breadcrumb, which reads as missing data rather than as "everything".
       ⚠️ "All channels", the words the switcher, chat and export already use.
       It said "This account", which Tommy read as meaning nothing -- one more
       name for one thing. */
    target: { kind: 'account', id: 'account', label: 'All channels' },
    scope: ['All channels'],
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
 * ⭐ THIS WEEK'S BIG MOVES, as things to act on.
 *
 * 🐛 The engine looked only at the selected window's shape -- pacing, ad
 * shares, missing variants -- and had no rule for "something just changed".
 * So Meta's cost per lead jumping 42% in a week sat on Notifications and the
 * Overview strip, and "what should I do next?" never mentioned it. A thought
 * partner that misses the thing the whole team is looking at is not one.
 *
 * Reads the SAME rules as the notification feed (`notifications()`), so the
 * two can never disagree about what counts as news -- a second threshold here
 * is how the strip and the agenda would drift.
 *
 * Tier 1, because the move itself is arithmetic. The ACTION is to find out
 * why, never to react to it: the data knows that CAC rose, not what caused it,
 * and "cut Meta" off one week is exactly the overreaction the tiers exist to
 * stop. A cost move asks what broke; a leads move asks what worked, so it can
 * be repeated.
 */
/** "Meta's", "Affiliates'" -- not "Affiliates's". */
const poss = (name: string) => (name.endsWith('s') ? `${name}'` : `${name}'s`);

function weeklyMove(channels: ChannelName[]): Candidate[] {
  return notifications(channels)
    .filter((n) => n.group === 'This week' && n.channel && n.change !== undefined && n.metric)
    .map((n) => {
      const ch = n.channel!;
      /* A campaign's own move is about the campaign: its figures, its name,
         and a scope that says which channel it sits in. */
      const isCampaign = n.target.kind === 'campaign';
      const name = isCampaign ? n.target.label : CHANNEL_LABEL[ch];
      const now = isCampaign ? campaignTotals(n.target.id, LAST_WEEK) : totals(ch, LAST_WEEK);
      const cur = isCampaign ? campaignRows(n.target.id, LAST_WEEK) : rowsFor(ch, LAST_WEEK);
      const prev = isCampaign ? campaignRows(n.target.id, LAST_WEEK, 1) : rowsFor(ch, LAST_WEEK, 1);
      const sum = (rs: typeof cur, f: 'spend' | 'leads') => rs.reduce((a, r) => a + r[f], 0);
      const prevCac = sum(prev, 'leads') > 0 ? sum(prev, 'spend') / sum(prev, 'leads') : 0;
      const bad = n.tone === 'bad';
      const pct = Math.abs(n.change!);
      const up = n.change! > 0;
      const prevLeads = sum(prev, 'leads');
      const isCac = n.metric === 'CAC';
      /* The sentence names the metric that moved, with both weeks' figures. */
      const action = isCac
        ? (bad ? `Find out why ${name} CAC ${up ? 'rose' : 'fell'} ${pct}% this week`
               : `Find out what cut ${poss(name)} CAC ${pct}% this week — and repeat it`)
        : (bad ? `Find out why ${name} leads fell ${pct}% this week`
               : `Find out what drove ${poss(name)} ${pct}% jump in leads — and repeat it`);
      const because = isCac
        ? `${name} paid ${formatDerived('CAC', now.cac)} a lead this week, against `
          + `${formatDerived('CAC', prevCac)} the week before. The move is in the numbers; the cause is not.`
        : `${name} brought in ${Math.round(now.leads).toLocaleString()} leads this week, against `
          + `${Math.round(prevLeads).toLocaleString()} the week before. The move is in the numbers; the cause is not.`;
      return {
        id: `weekly:${n.id}`,
        tier: 1 as Tier,
        kind: 'weekly-move' as DecisionKind,
        action,
        because,
        /* The figures of the metric that MOVED come first -- a leads story
           opened on two CAC figures, and the reader had to hunt for the jump. */
        evidence: isCac ? [
          { label: 'This week CAC', value: formatDerived('CAC', now.cac) },
          { label: 'Last week CAC', value: formatDerived('CAC', prevCac) },
          { label: 'Leads this week', value: Math.round(now.leads).toLocaleString() },
          { label: 'Change', value: `${n.change! > 0 ? '+' : ''}${n.change}% CAC` },
        ] : [
          { label: 'Leads this week', value: Math.round(now.leads).toLocaleString() },
          { label: 'Leads last week', value: Math.round(prevLeads).toLocaleString() },
          { label: 'CAC this week', value: formatDerived('CAC', now.cac) },
          { label: 'Change', value: `${n.change! > 0 ? '+' : ''}${n.change}% leads` },
        ],
        expectation: {
          outcome: bad
            ? 'You know whether it is the audience, the creative or the auction before the next budget change.'
            : 'You know what changed, so it can be done again on purpose.',
          checkOn: checkDate(LAST_WEEK),
        },
        target: isCampaign ? n.target : { kind: 'channel' as const, id: ch, label: name },
        scope: isCampaign ? [CHANNEL_LABEL[ch], name] : [name],
        channel: ch,
        atStake: now.spend,
        /* Ahead of the slow structural findings: this is what changed. */
        strength: Math.min(1, 0.7 + pct / 100),
      };
    });
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
    ...weeklyMove(channels),
    ...spendReturnMismatch(range, channels),
    ...pausedWinner(range, channels),
    ...scaleWinner(range, channels),
    ...reallocateWithinChannel(range, channels),
    ...staleReview(channels),
    ...noVariant(range, channels),
    ...beatsItsChannel(range, channels),
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
