import {
  CHANNEL_KEYS,
  CHANNEL_LABEL, rangeOver, activeChannels, delta, formatMetric, totals,
  type Metric, type Range, type Scope,
} from './metrics';
import type { ChannelName } from '../styles/tokens';
import { decisions, decisionsFor, limitsFor, type Candidate, type Target } from './decisions';
import { isFlagged } from './attention';
import { compareCampaigns } from './compare';
import { commitments, recordOf, type Commitment } from './commitments';
import { MEMBERS } from './chat';
import { campaignTotals } from './campaignSeries';
import {
  ASSUME_CAC_HOLDS, ASSUME_LAST_TOUCH, defaultExtra, moveBudget, parseAmount, scaleWithin, whereToScale,
} from './scenario';
import { CAMPAIGNS, type Campaign } from './campaigns';
import { creativeById, creativeTotals, creativesFor } from './creative';
import { trendBy, type TrendPoint } from './trend';

/**
 * The assistant.
 *
 * There is no model behind this. Every answer is computed from the same
 * functions the dashboard renders from, and every answer carries the figures
 * it used. That is a deliberate choice, not a limitation worked around: an
 * assistant that sits on top of a numbers product and produces a number the
 * product cannot show you is worse than no assistant.
 *
 * The most important behaviour here is the refusal. When nothing matches, it
 * says so and lists what it can do. A confident wrong answer is the failure
 * mode this whole build keeps running into, and it is the one thing an
 * assistant is best at producing.
 */

export interface Evidence {
  label: string;
  value: string;
  channel?: ChannelName | 'all';
}

/** A page consulted on the open web. Never merged into `evidence` — see below. */
export interface Source { title: string; url: string }

export interface Answer {
  text: string;
  evidence?: Evidence[];
  /**
   * Outside context, kept separate from `evidence` on purpose.
   *
   * `evidence` is this account's actuals. A source is someone else's number
   * about someone else's business. Listing them together would let the weaker
   * claim borrow the authority of the stronger one, which is the failure this
   * panel is built to avoid — so they get different treatments in the UI.
   */
  sources?: Source[];
  /** False when nothing matched, so the UI can present it as a limit. */
  answered: boolean;
  /**
   * What to ask next — the thing that turns a lookup into a conversation.
   *
   * ⭐ A marketer opening this does not arrive with a well-formed question. They
   * arrive with *"what does this mean?"*, and the useful reply is not just an
   * answer but a route onward. Offering the next question is how the panel stops
   * being a search box with a personality and starts being a thought partner.
   *
   * Written per answer rather than fixed, because the right next question depends
   * entirely on what was just said. After a tier-3 refusal the follow-up is *"so
   * what WOULD tell me?"* — which is the most useful thing a reader can ask and
   * the one they are least likely to think of on their own.
   */
  followUps?: string[];
  /**
   * Decisions the reader can take straight from this answer.
   *
   * ⭐ The point of the panel is to end in a DECISION, not in a good sentence.
   * Reading "pause this ad, it takes 15% of spend for 8% of leads", agreeing, and
   * then having to go find the Decisions screen to act is a seam the product puts
   * in front of the one moment it was built for.
   *
   * ⚠️ TIER 1 AND 2 ONLY. A tier 3 finding is a question, and there is nothing to
   * take — offering a button would turn the refusal back into the recommendation
   * the tier exists to prevent. `takeable()` enforces it.
   */
  /**
   * ⚠️ Three states, and the difference matters to the panel:
   *   undefined — this was not a decision question. No block at all.
   *   []        — it WAS, and there is nothing to offer. The block renders with
   *               the write-in only, because someone may act anyway.
   *   [items]   — offers, plus the write-in.
   *
   * An empty array used to be indistinguishable from undefined, so a "nothing to
   * do" answer lost the write-in — the one moment a reader most needs to record
   * a decision the engine did not propose.
   */
  decisions?: Takeable[];
}

export interface Takeable {
  id: string;
  action: string;
  tier: 1 | 2;
  /**
   * Where it lives, in words — "Paid Search › Non-brand — High Intent".
   *
   * ⚠️ WORDS, not a mark, and that is the whole field. A decision named only by
   * its action loses which account it touches: "Decide on Non-brand — High
   * Intent" and "Review pacing" read as the same KIND of thing, and one is a
   * campaign while the other is the entire account.
   *
   * The panel row deliberately carries no channel logo — naming the channel here
   * says it once, and a mark beside it said it twice in a line with room for
   * neither. `Candidate.channel` still exists for the surfaces that do render a
   * mark; this view-model does not need it, so it does not carry it.
   */
  context?: string;
  /** Why, in one sentence -- the card's second line. */
  because: string;
  /** What it is about, so taking it records where to go back to. */
  target?: Target;
}

/**
 * The actionable findings behind an answer, as things a reader can accept.
 *
 * Shared, for the same reason `followUpsFor` is: the model path returns prose
 * and no ids, so the buttons have to come from the engine either way. They
 * correspond to what the model described by construction — it was instructed to
 * report `get_decisions`, and this reads the same function.
 */
export function takeable(candidates: Candidate[]): Takeable[] {
  return candidates
    .filter((c): c is Candidate & { tier: 1 | 2 } => c.tier !== 3)
    /* ⭐ A decision already taken is not offered again.
     *
     * It used to reappear in every later answer wearing "✓ On your queue", which
     * is truthful and useless: the reader asked a new question and got back a
     * row saying something they did that they already know about. Worse, it
     * looked like the new inquiry had somehow acted on its own.
     *
     * An offer is for something you have not done. Once it is on the queue it
     * belongs to the queue, and the queue is where it is managed. */
    .filter((c) => !isFlagged('decision', c.id))
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      action: c.action,
      because: c.because,
      tier: c.tier,
      channel: c.channel,
      target: c.target,
      /* ⭐ The SAME path the card shows, not a second derivation of it. The panel
         row previously used target.label alone, so an ad-level decision read
         "Retargeting — 30d" here and "Meta › Advantage+ — Evergreen Signups ›
         Retargeting — 30d" on the card it becomes. One decision, two addresses.

         Joined rather than an array because the row has one line; the card has
         room to break it into crumbs. */
      context: c.scope.join(' \u203a '),
    }));
}

/**
 * Who or what a question is about, worked out from its text.
 *
 * 🐛 THE SUBJECT WAS ONLY TRAVELLING WHEN A ROW BUTTON SUPPLIED IT.
 *
 * A follow-up chip calls submit() with the question and nothing else, and a typed
 * question has nothing else by definition — so "What would you do about App
 * Walkthrough Series?" reached the server bare, get_decisions ran unscoped, and
 * the answer came back carrying the pacing finding, a Paid Search review and a
 * Meta paused ad. Every row correct, none of them about the YouTube campaign that
 * was asked about.
 *
 * ⚠️ And the chips are the MAIN path. "What would you do about X?" is generated
 * from a subject and then throws it away, which is the worst possible place to
 * lose it: the product wrote the question itself and still could not say what it
 * was about.
 *
 * So resolution lives in one place and every caller uses it. A control's explicit
 * subject still wins — it knows an id, and text matching cannot beat that — but
 * absence of one is no longer absence of a subject.
 */
export function resolveSubject(question: string): Target | undefined {
  const q = question.toLowerCase();

  /* Most specific first, same order the pull branch uses. */
  /* Longest headline first, for the same reason as campaigns. */
  const ad = CAMPAIGNS.flatMap((c) => creativesFor(c.id))
    .filter((x) => x.headline.length > 8 && q.includes(x.headline.toLowerCase()))
    .sort((a, b) => b.headline.length - a.headline.length)[0];
  if (ad) return { kind: 'ad', id: ad.id, label: ad.headline };

  const campaign = campaignIn(question);
  if (campaign) return { kind: 'campaign', id: campaign.id, label: campaign.name };

  const channel = findChannels(question)[0];
  if (channel) return { kind: 'channel', id: channel, label: CHANNEL_LABEL[channel] };

  return undefined;
}

/**
 * The campaign a question names -- or undefined. ONE rule, used everywhere:
 *
 *   1. The LONGEST full name that appears in the question wins.
 *   2. Else the campaign whose name shares the longest opening with the
 *      question ("Tax Season" -> "Tax Season — Prospecting"), at least 8
 *      characters, and only if no other campaign ties -- a tie is ambiguous,
 *      and a guess is how you answer about the wrong one.
 *
 * 🐛 Real accounts name campaigns with long shared prefixes ("CA | Prospecting
 * | Lookalike 3% | v10" vs "CA | Prospecting | Site Visitors 30d | v6"). The
 * old first-14-characters match answered 13 of 20 questions about the wrong
 * campaign, and "Cluster 21" resolved to "Cluster 2".
 */
export function campaignIn(question: string): Campaign | undefined {
  const q = question.toLowerCase();
  const full = CAMPAIGNS.filter((c) => q.includes(c.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length);
  if (full.length) return full[0];
  let best: Campaign | undefined; let bestK = 0; let tie = false;
  for (const c of CAMPAIGNS) {
    const n = c.name.toLowerCase();
    let k = 0;
    for (let len = Math.min(n.length, 60); len >= 8; len -= 1) {
      if (q.includes(n.slice(0, len))) { k = len; break; }
    }
    if (k > bestK) { best = c; bestK = k; tie = false; }
    else if (k > 0 && k === bestK) tie = true;
  }
  return bestK >= 8 && !tie ? best : undefined;
}

/** Decisions a question implies, for whichever engine answered it. */
export function decisionsForQuestion(
  question: string, range: Range, subject?: Target,
): Takeable[] {
  const q = question.toLowerCase();

  /* ⭐ ONLY where a decision was actually argued.
   *
   * "What's going on with Total spend" is a STATUS question. Its answer informs:
   * here are the figures, here is a finding the engine raised, here is what this
   * data cannot tell you. Nothing has been weighed yet — so putting "Make the
   * decision" under it asks the reader to commit before the case has been made,
   * and skips the deliberation this panel exists to host.
   *
   * ⚠️ It also makes the button cheap. A control that appears under every answer
   * stops reading as a commitment and starts reading as decoration, which is
   * exactly the wrong thing for the one irreversible-ish action here.
   *
   * The status answer already routes onward: its first follow-up chip is "What
   * would you do about X?". THAT answer argues the decision, and that is where
   * the button belongs. Ask, then decide — two steps, on purpose.
   */
  if (!/what would you do|what should i do|what.s next|recommend|priorit|what.s the (call|move|decision)|\bcut\b|\bpause\b|\bstop\b/i.test(q)) {
    return [];
  }
  const target: Target | undefined = subject
    ?? (findChannels(question)[0]
      ? { kind: 'channel', id: findChannels(question)[0], label: '' }
      : undefined);
  return takeable(target ? decisionsFor(target, range) : decisions(range));
}

const METRIC_WORDS: [RegExp, Metric][] = [
  [/\bcac\b|cost per (lead|acquisition)|acquisition cost/i, 'CAC'],
  [/\broas\b|return on ad spend|return/i, 'ROAS'],
  [/\bspend(ing)?\b|budget|cost\b/i, 'Spend'],
  [/\bleads?\b/i, 'Leads'],
  [/\bsales?\b|conversions?/i, 'Sales'],
  [/\bclicks?\b|traffic/i, 'Clicks'],
];

function findMetric(q: string): Metric | null {
  for (const [re, m] of METRIC_WORDS) if (re.test(q)) return m;
  return null;
}

function findChannels(q: string): ChannelName[] {
  return activeChannels().filter((k) => {
    const label = CHANNEL_LABEL[k].toLowerCase();
    return q.toLowerCase().includes(label) || q.toLowerCase().includes(k.toLowerCase());
  });
}

function valueOf(scope: Scope, metric: Metric, range: Range): number {
  const t = totals(scope, range);
  switch (metric) {
    case 'Spend': return t.spend;
    case 'Clicks': return t.clicks;
    case 'Leads': return t.leads;
    case 'Sales': return t.sales;
    case 'CAC': return t.cac;
    case 'ROAS': return t.roas;
  }
}

/** Lower is better for cost; higher for everything else here. */
function lowerIsBetter(metric: Metric): boolean {
  return metric === 'CAC';
}

/**
 * Where to go next, given what was just asked.
 *
 * ⭐ EXPORTED, because follow-ups are a PRODUCT behaviour, not a model output.
 *
 * 🐛 They shipped as something the local engine attached to its own answers, so
 * the moment an API key was configured and the model started replying, the chips
 * vanished — the decision-first prompt Tommy asked for existed only on the path
 * he was not using. The panel behaved differently depending on which engine
 * answered, which is exactly what `assistantClient` exists to prevent everywhere
 * else.
 *
 * The rule lives here once and both paths use it.
 */
export function followUpsFor(
  question: string, subject?: { kind: string; label: string },
): string[] {
  const q = question.toLowerCase();

  /* After a status answer, the next question is the DECISION -- not "why did you
     say that", which explains something they have not asked about yet. */
  if (/what.s (going on|happening)|tell me about|how is|what about|dig into/i.test(q)) {
    return [
      subject ? `What would you do about ${subject.label}?` : 'What would you do?',
      'What can this data not tell me?',
      'What should I do next?',
    ];
  }

  if (/what would you do|what.s the (call|move|decision)|recommendation/i.test(q)) {
    return ['What can this data not tell me?', 'What should I do next?'];
  }

  if (/cannot tell|can.t tell|not tell|limitation|blind spot/i.test(q)) {
    return ['What should I do next?', 'What should I cut?'];
  }

  if (/what should i do|what.s next|recommend|priorit|cut|pause|stop/i.test(q)) {
    return ['What can this data not tell me?', 'What should I cut?'];
  }

  /* A plain lookup still gets a route onward — that is the difference between a
     search box and a thought partner. */
  return [
    subject ? `What would you do about ${subject.label}?` : 'What should I do next?',
    'What can this data not tell me?',
  ];
}

export const SUGGESTIONS = [
  /* Decision-shaped first, because that is what the panel is FOR now. The
     lookups still work and still matter, but they are not the reason someone
     opens this. */
  'What should I do next?',
  'What should I cut?',
  'Which channel has the best ROAS?',
  'Why is Meta CAC up?',
];

/* ── The decision agent ─────────────────────────────────────────────────────

   ⭐ The engine is what the assistant reasons FROM. It does not get to invent a
   recommendation; it reads `decisions.ts`, which computed them deterministically
   and classified each one by how well this data supports it.

   That inversion is the whole safety property. A model — or, here, a regex —
   asked "what should I do" will always produce something confident. Asked to
   REPORT what a tested function found, it can only be as wrong as the function,
   and the function has tests. */

function tierWord(c: Candidate): string {
  return c.tier === 1 ? 'and this one is just arithmetic'
    : c.tier === 2 ? 'and it rests on an assumption I will name'
    : 'but I cannot tell you the answer';
}

function asEvidence(c: Candidate): Evidence[] {
  /* 🐛 Every row carried the FINDING's channel, so a Podcasts finding's
     comparison row "TikTok CAC $33.38" wore the Podcasts mark. A row that names
     a channel is that channel's. */
  const named = (label: string) => (Object.entries(CHANNEL_LABEL) as [ChannelName, string][])
    .find(([, l]) => label.startsWith(l))?.[0];
  return c.evidence.slice(0, 4).map((e) => ({
    label: e.label, value: e.value, channel: named(e.label) ?? c.channel,
  }));
}

/** One candidate, written out conversationally rather than as a card. */
function speak(c: Candidate): string {
  const lines = [`${c.action} — ${c.because}`];
  if (c.expectation) {
    lines.push(`Expect: ${c.expectation.outcome}`);
    if (c.expectation.assuming) {
      /* Its own LINE, not merely its own sentence. A projection whose assumption
         is buried mid-paragraph reads as a promise, and the tier distinction
         collapses at exactly the moment it matters. */
      lines.push(`⚠️ That assumes ${c.expectation.assuming}. If it does not hold, neither does the number.`);
    }
  }
  if (c.needs) lines.push(`To answer it you would need ${c.needs}`);
  return lines.join('\n');
}

/**
 * Ask the agent something.
 *
 * ⭐ `subject` is how a BUTTON says what it is pointing at, instead of hoping the
 * agent can parse it back out of a sentence.
 *
 * 🐛 The bug that forced it: ad headlines are not unique. "Start free, no card"
 * appears in several campaigns, because the copy generator cycles a fixed set of
 * hooks. So resolving an ad by its headline returned whichever one matched first
 * -- click Ask on a TikTok ad and get an answer about a Meta ad with the same
 * words, confidently, with evidence attached.
 *
 * Name-matching stays for questions a PERSON types, where a name is all there is.
 * A control has an id and should say so.
 */
export function ask(question: string, range: Range, subject?: Target): Answer {
  const q = question.trim();
  if (!q) return { text: '', answered: false };

  const metric = findMetric(q);
  const channels = findChannels(q);
  const periodOver = rangeOver(range);

  const found = decisions(range);

  /* ⭐ WHAT IF -- scaling and moving money (scenario.ts). Checked first: "where
     should more budget go" also matches the agenda's "where should", and would
     otherwise answer a different question -- what to fix, not where to grow. */
  /* What the TEAM committed to -- checked first, because "what did we decide
     about Meta" names a channel and would otherwise be read as a data question. */
  const mine = commitmentAnswer(q);
  if (mine) return mine;

  const scenario = whatIf(q, range, subject);
  if (scenario) return scenario;

  /* "Compare A with B" -- two campaigns, head to head (compare.ts). */
  const head = compareAnswer(q, range);
  if (head) return head;

  /* "what would you do about X" -- the decision, scoped to one subject.

     Placed BEFORE the "what's going on" branch because "what would you do about
     Meta" contains no "what's going on" but does name a subject; routed the
     other way it would answer the wrong question. */
  /* 🐛 "What should I do about Meta?" -- the brief's own suggested question --
     fell through to the account-wide agenda below and answered about
     everything. With "about <something>" it is this question, scoped. */
  if (/what would you do|what.s the (call|move|decision)|your recommendation|what (should|do|can) i do (about|with|on)\b/i.test(q)) {
    const campaignFor = subject?.kind === 'campaign'
      ? CAMPAIGNS.find((c) => c.id === subject.id)
      : campaignIn(q);
    const chFor = subject?.kind === 'channel'
      ? (subject.id as ChannelName) : findChannels(q)[0];

    const tgt: Target = subject?.kind === 'ad' ? subject
      : campaignFor ? { kind: 'campaign', id: campaignFor.id, label: campaignFor.name }
      : chFor ? { kind: 'channel', id: chFor, label: CHANNEL_LABEL[chFor] }
      : { kind: 'account', id: 'account', label: 'this account' };

    /* 🐛 With no subject the target is the account, and decisionsFor(account)
       returns only ACCOUNT-level findings -- so "What would you do?" answered
       "One call: review pacing" while "What should I do next?" listed twelve.
       Nothing named = everything. */
    const mine = tgt.kind === 'account' ? found : decisionsFor(tgt, range, undefined, found);
    /* ⚠️ Taken decisions leave the NARRATION, not just the buttons.
       
       The prose used `act` and the buttons used takeable(act), which filters what
       is already on the queue — so after taking everything the answer still said
       "3 calls on Meta" above zero buttons. The same divergence the server fix
       closed, sitting untouched in the local engine because both halves lived in
       one function and looked like they agreed. */
    const act = mine.filter((c) => c.tier !== 3 && !isFlagged('decision', c.id));
    const ask3 = mine.filter((c) => c.tier === 3);

    if (act.length === 0) {
      return {
        answered: true,
        text: [
          `Nothing about ${tgt.label} that this data supports acting on.`,
          ask3.length > 0
            ? `${ask3[0].action} ${ask3[0].because}`
            : 'The numbers are within the bands where a change would be noise rather than a finding.',
          'I would rather say that than manufacture a recommendation to fill the space.',
        ].join('\n\n'),
        /* ⚠️ A decision question that found nothing. The write-in still renders. */
        decisions: [],
        /* ⚠️ And NOT "What should I do next?" — asking that immediately after
           saying there is nothing to do contradicts the sentence above it. The
           useful next question after a no is about the limits of the no. */
        followUps: ['What can this data not tell me?'],
      };
    }

    const shown = act.slice(0, 3);
    return {
      answered: true,
      /* ⚠️ Counts what it SHOWS, not what it found. Both the narration and the
         buttons cap at three, so `act.length` would announce "5 calls" above
         three of them — the header disagreeing with the list underneath it. */
      text: [
        /* ⭐ The calls themselves are the CARDS below this line -- each one
           once, recommendation first (Tommy, Sept 30). Narrating them here as
           well put every decision on screen twice, the second copy buried in
           a paragraph. */
        shown.length === 1
          ? `One call on ${tgt.label}:`
          : `${shown.length} calls on ${tgt.label}, best-supported first:`,
        ask3.length > 0
          ? `And one I will not turn into a call: ${ask3[0].action} ${ask3[0].because}`
          : '',
      ].filter(Boolean).join('\n\n'),
      evidence: asEvidence(act[0]),
      decisions: takeable(act),
      followUps: [
        `Why \u201c${act[0].action}\u201d?`,
        'What should I do next?',
        'What can this data not tell me?',
      ],
    };
  }

  /* ── User-initiated: "what's going on with THIS?" ────────────────────────

     ⭐ The engine pushes an agenda; this is the pull. A marketer looking at a row
     is not asking "what should I do" -- they are asking about the thing in front
     of them, and an agenda cannot answer a question it did not anticipate.

     Same engine and the same tiers. The only difference is who chose the subject,
     which matters because a separate "explain this entity" path would be a second
     source of judgement that could disagree with the first -- and the reader would
     have no way to know which to believe. */
  if (/what.s (going on|happening)|tell me about|look at|explain|how is|what about|dig into/i.test(q)) {
    /* Campaign or ad by name before channel, because the more specific match is
       almost always the intent -- someone naming a campaign does not want its
       whole channel's answer. */
    /* An explicit subject wins outright -- a control knows what it pointed at,
       and re-deriving it from prose can only lose. Falls back to name matching
       for a typed question, most specific first. */
    const ad = subject?.kind === 'ad'
      ? creativeById(subject.id)?.creative
      : CAMPAIGNS.flatMap((c) => creativesFor(c.id))
          .find((x) => x.headline.length > 8
            && q.toLowerCase().includes(x.headline.toLowerCase()));

    const campaign = ad
      ? CAMPAIGNS.find((c) => c.id === creativeById(ad.id)?.campaignId)
      : subject?.kind === 'campaign'
        ? CAMPAIGNS.find((c) => c.id === subject.id)
        : campaignIn(q);

    const channel = subject?.kind === 'channel'
      ? (subject.id as ChannelName)
      : findChannels(q)[0];

    const target: Target = ad
      ? { kind: 'ad', id: ad.id, label: ad.headline }
      : campaign
        ? { kind: 'campaign', id: campaign.id, label: campaign.name }
        : channel
          ? { kind: 'channel', id: channel, label: CHANNEL_LABEL[channel] }
          : { kind: 'account', id: 'account', label: 'this account' };

    const mine = decisionsFor(target, range, undefined, found);
    /* Taken decisions are on the queue, not suggestions -- the same rule the
       "what would you do" branch follows. */
    const actionable = mine.filter((c) => c.tier !== 3 && !isFlagged('decision', c.id));
    const questions = mine.filter((c) => c.tier === 3);
    const limits = limitsFor(target.kind);

    /* The numbers first, because that is what they are looking at.
       🐛 A campaign or ad used to be given the ACCOUNT's totals under its own
       name ("App Walkthrough Series spend $160,780") -- the whole account's
       spend, labelled as one campaign's. Each subject gets its own figures. */
    const scope: Scope = target.kind === 'channel' ? (target.id as ChannelName)
      : campaign ? campaign.channel : 'all';
    const t = target.kind === 'ad' ? creativeTotals(target.id, range)
      : target.kind === 'campaign' ? campaignTotals(target.id, range)
      : totals(scope, range);
    const figures = `${formatMetric('Spend', t.spend)} spend, ${formatMetric('Leads', t.leads)} leads, `
      + (t.leads > 0 ? `${formatMetric('CAC', t.cac)} CAC.` : 'no leads yet, so no CAC.');
    const head = target.kind === 'ad'
      ? `“${target.label}” — an ad in ${campaign?.name ?? 'this account'}, over ${periodOver}: ${figures}`
      : `${target.label} over ${periodOver}: ${figures}`;

    const body: string[] = [head];

    if (actionable.length > 0) {
      /* 🐛 Said "5 things I can act on:" above three of them. Counts what it shows. */
      const shown = actionable.slice(0, 3);
      body.push(shown.length === 1 ? 'One thing I can act on:'
        : actionable.length > shown.length ? `${actionable.length} things I can act on — the ${shown.length} strongest:`
        : `${shown.length} things I can act on:`);
      /* Sept 30: the ACTION only, one per line. Each used to be argued in full
         here -- three paragraphs of because/expect in what is a status answer.
         The argument and the button live one step on ("What would you do about
         X?"), where the case is actually made. */
      body.push(shown.map((c) => `• ${c.action}`).join('\n'));
    } else {
      body.push('Nothing here that this data supports acting on. Not a problem -- just not a finding.');
    }

    if (questions.length > 0) {
      body.push(`And one I will not turn into a recommendation: ${questions[0].action} ${questions[0].because}`);
    }

    /* ⚠️ The limits are stated EVERY time, not only when something looks wrong.
       A caveat that appears only alongside bad news reads as an excuse; stated
       always, it is a property of the instrument. */
    body.push(`What I cannot tell you about it: ${limits.join('; ')}.`);

    return {
      answered: true,
      text: body.join('\n\n'),
      evidence: actionable[0] ? asEvidence(actionable[0]) : [
        { label: `${target.label} spend`, value: formatMetric('Spend', t.spend), channel: scope },
        { label: `${target.label} CAC`, value: t.leads > 0 ? formatMetric('CAC', t.cac) : '—', channel: scope },
      ],
      /* ⚠️ NO takeable decisions here, deliberately. This is a status answer --
         it reports, it does not argue. The first follow-up routes to "What would
         you do about X?", and the button lives on THAT answer, where the case has
         actually been made. */
      followUps: followUpsFor(q, target),
    };
  }

  /* "what should I do" — the agenda, best-supported first. */
  if (/what should i do|what.s next|recommend|suggest|where should|advice|priorit/i.test(q)) {
    const actionable = found.filter((c) => c.tier !== 3 && !isFlagged('decision', c.id));
    if (actionable.length === 0) {
      return {
        answered: true,
        text: `Nothing in this data supports an action right now. That is a real answer rather than an empty one — I would rather say so than manufacture a recommendation.`,
        decisions: [],
        followUps: ['What can this data not tell me?'],
      };
    }
    /* ⭐ What CHANGED THIS WEEK first, then the rest by evidence. A weekly move
       that ends in a raise is a forecast (tier 2), so in the engine's order it
       sank below tier-1 housekeeping like "add a second ad group" and this
       answer stopped opening on the news. The engine keeps its order; this
       answer leads with the week -- and its header says so. */
    const weekly = actionable.filter((c) => c.kind === 'weekly-move');
    const top = [...weekly, ...actionable.filter((c) => c.kind !== 'weekly-move')].slice(0, 3);
    const lead = weekly.length > 0
      ? `${top.length === 1 ? 'One thing' : `${top.length} things`}: this week’s moves first, then the strongest evidence over ${periodOver}:`
      : `${top.length === 1 ? 'One thing' : `${top.length} things`} over ${periodOver}, strongest evidence first:`;
    return {
      answered: true,
      /* ⚠️ Newline-delimited, not one paragraph. The first version returned all
         three findings as a single block of prose and it was unreadable, which
         defeats the point of a conversational surface. The panel splits on blank
         lines. */
      text: [
        lead,
        found.some((c) => c.tier === 3)
          ? `There is also something the numbers raise that I deliberately will not turn into a recommendation — ask me what this data cannot tell you.`
          : '',
      ].filter(Boolean).join('\n\n'),
      evidence: asEvidence(top[0]),
      decisions: takeable(top),
      followUps: [
        `Why “${top[0].action}”?`,
        'What can this data not tell me?',
        'What should I cut?',
      ],
    };
  }

  /* "why <an action>" — the argument behind one recommendation.
     ⚠️ BEFORE the cut branch: actions now start with "Pause", "Cut" and "End",
     so "Why “Pause …”?" was answered as "what should I cut?". */
  if (/^why\b/i.test(q)) {
    const match = found.find((c) =>
      q.toLowerCase().includes(c.action.toLowerCase().slice(0, 18)));
    if (match) {
      return {
        answered: true,
        text: [speak(match),
          match.tier === 3 ? '' : `I am raising it ${tierWord(match)}.`,
        ].filter(Boolean).join('\n\n'),
        evidence: asEvidence(match),
        followUps: ['What should I do next?', 'What can this data not tell me?'],
      };
    }
  }

  /* 🚨 "what should I cut" — the question most likely to produce a confident,
     expensive, wrong answer.

     ⚠️ This branch used to rank channels by CAC and name the most expensive one,
     with a caveat sentence after it. That IS the podcast trap: the arithmetic is
     right, the recommendation it implies is unsupportable, and a caveat at the
     end does not undo a headline. It answered the question it was asked instead
     of the question that could be answered.

     Now it reports what the engine found — pauses it can actually justify at ad
     level — and hands the channel-level version to the tier-3 refusal, which
     says plainly that this data cannot settle it. */
  /* 🐛 "Which channel has the worst ROAS?" landed here on "worst" and answered
     "At the ad level, yes. Pause…". With a metric named it is a RANKING
     question, and the ranking branch below owns it. */
  if (/\bcut\b|\bpause\b|\bstop\b|\bkill\b/i.test(q) || (/worst|underperform/i.test(q) && !metric)) {
    /* Every action that takes money OUT -- a pause, a cut, an end -- at the
       ad or campaign level. Never a whole channel on cost alone. */
    const pauses = found.filter((c) => c.tier !== 3 && /^(Pause|Cut|End) /.test(c.action)
      && c.target.kind !== 'channel');
    const gap = found.find((c) => c.tier === 3);

    if (pauses.length > 0) {
      return {
        answered: true,
        text: [
          `Yes, at the ad and campaign level:`,
          gap ? `At the CHANNEL level I would not answer it. ${gap.because}` : '',
        ].filter(Boolean).join('\n\n'),
        evidence: asEvidence(pauses[0]),
        /* ⚠️ The pauses only. `gap` is the tier-3 cross-channel question and it
           is deliberately NOT takeable -- this branch names it in the same
           breath as the pauses, which is exactly where a button on it would do
           the most damage. */
        decisions: takeable(pauses),
        followUps: gap
          ? ['What can this data not tell me?', 'What should I do next?']
          : ['What should I do next?'],
      };
    }

    if (gap) {
      return {
        answered: true,
        text: [`Not from this.`, gap.because,
          gap.needs ? `To answer it properly you would need ${gap.needs}` : '',
        ].filter(Boolean).join('\n\n'),
        evidence: asEvidence(gap),
        followUps: ['What should I do next?', 'What can this data not tell me?'],
      };
    }
  }

  /* "what can't this tell me" — the tier-3 findings, as questions.

     ⭐ The most useful thing in the panel, and the least likely to be asked
     unprompted, which is exactly why every other answer offers it as a follow-up. */
  /* 🐛 `not tell` is here because it was MISSING, and the omission was the worst
     kind: "What can this data not tell me?" is the exact string this module
     offers as a follow-up chip, and it fell through to the generic refusal. The
     panel was inviting a question it then claimed not to understand. Generated
     prompts have to be tested against the matcher that receives them. */
  if (/cannot tell|can.t tell|not tell|what.s missing|limitation|not know|blind spot|trust/i.test(q)) {
    const questions = found.filter((c) => c.tier === 3);
    if (questions.length === 0) {
      return {
        answered: true,
        text: `Nothing in the current numbers raises a question I cannot answer — but the general limits still hold: no attribution model, no campaign log, no view of what someone saw before they converted.`,
        followUps: ['What should I do next?'],
      };
    }
    const c = questions[0];
    return {
      answered: true,
      text: [c.action, c.because,
        c.needs ? `To answer it you would need ${c.needs}` : '',
      ].filter(Boolean).join('\n\n'),
      evidence: asEvidence(c),
      followUps: ['What should I do next?', 'What should I cut?'],
    };
  }

  /* "which channel has the best/worst X" — a ranking question. */
  if (metric && /\bwhich\b|\bbest\b|\bworst\b|\btop\b|\bhighest\b|\blowest\b/i.test(q)) {
    /* Two different questions wearing similar words.

       "highest" and "lowest" ask about MAGNITUDE. "best" and "worst" ask about
       QUALITY, which for a cost metric is the opposite of magnitude. The old
       line XORed the two together, so for CAC it inverted the direction words:
       "which channel has the highest CAC" answered TikTok at $33.38 -- the
       cheapest -- and "lowest CAC" answered Podcasts at $128.80. Both stated as
       fact, with evidence rows attached. Kept apart now, because they are not
       the same question. */
    const wantsSmallest = /\bhighest\b|\blowest\b/i.test(q)
      ? /\blowest\b/i.test(q)
      : /\bworst\b/i.test(q) ? !lowerIsBetter(metric) : lowerIsBetter(metric);

    const ranked = [...activeChannels()].sort((a, b) => {
      const d = valueOf(a, metric, range) - valueOf(b, metric, range);
      return wantsSmallest ? d : -d;
    });
    const [first, second] = ranked;
    if (!first) return { answered: false, text: '' };

    /* "leads on" was hardcoded, so asking for the WORST ROAS produced
       "Podcasts leads on ROAS at 2.1x, ahead of YouTube at 3.1x" -- a sentence
       asserting the reverse of the two numbers inside it. Say which end of the
       range this is and let the reader judge it. */
    const superlative = wantsSmallest ? 'lowest' : 'highest';
    const tail = second
      ? `, followed by ${CHANNEL_LABEL[second]} at ${formatMetric(metric, valueOf(second, metric, range))}`
      : '';
    return {
      answered: true,
      text: `${CHANNEL_LABEL[first]} has the ${superlative} ${metric} over ${periodOver} at ${formatMetric(metric, valueOf(first, metric, range))}${tail}.`,
      evidence: ranked.slice(0, 3).map((k) => ({
        label: `${CHANNEL_LABEL[k]} ${metric}`,
        value: formatMetric(metric, valueOf(k, metric, range)),
        channel: k,
      })),
    };
  }

  /* "how is X trending by week", "last 12 weeks", "month by month" -- the
     table's Week / Month view, in words. Same function the table reads, so
     the answer and the columns cannot disagree. What moved, never why. */
  if (!/\bwhy\b/i.test(q)
      && /trend|by week|weekly|week by week|by month|monthly|month by month|last \d+ (weeks?|months?)|past \d+ (weeks?|months?)/i.test(q)) {
    const m: Metric = metric ?? 'Spend';
    const scope: Scope = channels.length ? channels[0] : subject?.kind === 'channel' ? subject.id as ChannelName : 'all';
    const name = scope === 'all' ? 'Blended' : CHANNEL_LABEL[scope as ChannelName];
    const byMonth = /month/i.test(q);
    const n = Number(q.match(/(?:last|past) (\d+) (?:weeks?|months?)/i)?.[1] ?? 0);
    /* Named span wins; otherwise the screen's window -- but never so short it
       answers nothing (two partial months, one partial week). */
    const days = n ? (byMonth ? n * 31 : n * 7)
      : byMonth ? Math.max(range, 183) : Math.max(range, 28);
    const t = trendBy(scope, m, byMonth ? 'month' : 'week', days);
    const shown = t.points.slice(-12);
    const unit = byMonth ? 'month' : 'week';
    const fmt = (v: number | null) => (v === null ? '—' : formatMetric(m, v));
    const latest = shown[shown.length - 1];
    const moves = t.points.map((p) => p.change).filter((c): c is number => c !== null);
    const up = moves.filter((c) => c > 0).length;
    const down = moves.filter((c) => c < 0).length;
    const flat = moves.length - up - down;
    const valued = t.points.filter((p) => p.value !== null && p.full);
    const hi = valued.reduce<TrendPoint | null>((a2, p) => (!a2 || p.value! > a2.value! ? p : a2), null);
    const lo = valued.reduce<TrendPoint | null>((a2, p) => (!a2 || p.value! < a2.value! ? p : a2), null);
    return {
      answered: true,
      text: [
        `${name} ${m} by ${unit}, ${n ? `the last ${n} ${unit}${n === 1 ? '' : 's'}` : `over ${t.days} days`}${t.points.length > shown.length ? ` (the latest ${shown.length} shown)` : ''}:\n`
          + shown.map((p) => `• ${p.label}: ${fmt(p.value)}${p.full ? '' : ` (${p.days} days)`}`).join('\n'),
        latest.change === null
          ? `Latest ${unit} (${latest.label}): ${fmt(latest.value)}.`
          : `Latest ${unit} (${latest.label}): ${fmt(latest.value)}, ${latest.change === 0 ? `level with the ${unit} before` : `${latest.change > 0 ? 'up' : 'down'} ${Math.abs(latest.change)}% on the ${unit} before`}.`,
        moves.length
          ? `Across ${moves.length} ${unit}-to-${unit} move${moves.length === 1 ? '' : 's'}: up ${up}, down ${down}, level ${flat}.`
            + (hi && lo && hi !== lo ? ` Highest ${fmt(hi.value)} (${hi.label}); lowest ${fmt(lo.value)} (${lo.label}).` : '')
          : '',
        'That is what moved. Why it moved is not in this data.',
      ].filter(Boolean).join('\n\n'),
      evidence: [
        { label: `${name} ${m} · ${latest.label}`, value: fmt(latest.value), channel: scope },
        ...(shown.length > 1 ? [{ label: `${name} ${m} · ${shown[shown.length - 2].label}`, value: fmt(shown[shown.length - 2].value), channel: scope }] : []),
      ],
      followUps: [
        latest.change !== null && latest.change !== 0 ? `Why is ${name} ${m} ${latest.change > 0 ? 'up' : 'down'}?` : 'What should I do next?',
        byMonth ? `How is ${name} ${m} trending by week?` : `How is ${name} ${m} trending by month?`,
      ],
    };
  }

  /* "why is X up" — direction and size, and an honest note about cause. */
  if (metric && /\bwhy\b|\bup\b|\bdown\b|\bris|\bfall|\bchang|\bmov/i.test(q)) {
    const scope: Scope = channels.length > 0 ? channels[0] : 'all';
    const change = delta(scope, metric, range);
    const value = valueOf(scope, metric, range);
    const name = scope === 'all' ? 'Blended' : CHANNEL_LABEL[scope as ChannelName];
    const dir = !Number.isFinite(change) ? 'with no earlier period of the same length to compare against'
      : change === 0 ? 'flat' : change > 0 ? `up ${change}%` : `down ${Math.abs(change)}%`;
    return {
      answered: true,
      text: `${name} ${metric} is ${formatMetric(metric, value)} over ${periodOver}, ${Number.isFinite(change) ? `${dir} against the preceding period` : dir}. I can tell you that it moved and by how much. I cannot tell you why — this data has no campaign changes, creative refreshes or auction pressure in it, so anything I said about cause would be invention.`,
      evidence: [
        { label: `${name} ${metric}`, value: formatMetric(metric, value), channel: scope },
        { label: 'Change vs prior period', value: Number.isFinite(change) ? `${change > 0 ? '+' : ''}${change}%` : '—', channel: scope },
      ],
    };
  }

  /* "how much did we spend on X" — a lookup. */
  if (metric) {
    const scope: Scope = channels.length > 0 ? channels[0] : 'all';
    const name = scope === 'all' ? 'All channels' : CHANNEL_LABEL[scope as ChannelName];
    return {
      answered: true,
      text: `${name} ${metric} over ${periodOver} is ${formatMetric(metric, valueOf(scope, metric, range))}.`,
      evidence: [{
        label: `${name} ${metric}`,
        value: formatMetric(metric, valueOf(scope, metric, range)),
        channel: scope,
      }],
      /* ⚠️ A lookup was the one answer that ended the conversation — it returned
         a figure and no route onward, so the panel went quiet at exactly the
         moment a reader has just learned something and might want to act on it.
         Every other answer offers somewhere to go; this one now does too. */
      followUps: followUpsFor(q, channels.length > 0
        ? { kind: 'channel', label: CHANNEL_LABEL[channels[0]] }
        : undefined),
    };
  }

  /* Nothing matched. Say so. */
  return {
    followUps: ['What should I do next?', 'What can this data not tell me?'],
    answered: false,
    text: `I could not turn that into a question about this data. I can only answer from what is on these screens — spend, clicks, leads, sales, CAC and ROAS, by channel, over the selected range. I do not have campaign history, creative, audiences or anything outside this dashboard, so I would rather say that than guess.`,
  };
}


/* ------------------------------------------------------------ what if -- */

/** Channels named in the question, in the order they appear -- "from A to B". */
function channelsInOrder(q: string): ChannelName[] {
  const lower = q.toLowerCase();
  return activeChannels()
    .map((k) => ({ k, i: Math.max(lower.indexOf(CHANNEL_LABEL[k].toLowerCase()), lower.indexOf(k.toLowerCase())) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.k);
}

const money = (n: number) => formatMetric('Spend', n);
const cacOf = (n: number) => formatMetric('CAC', n);
const leads = (n: number) => Math.round(n).toLocaleString();

/**
 * The scaling questions, answered as projections with their assumptions said.
 * Short lines, one idea each -- the answer is read, not studied.
 */
function whatIf(q: string, range: Range, subject?: Target): Answer | undefined {
  const named = channelsInOrder(q);
  const amount = parseAmount(q);
  /* A stated $0 is an answer to give, not a gap to fill with the default. */
  if (amount === 0 && /\b(move|shift|add|spend|put|invest|budget|scale)\b/i.test(q)) {
    return {
      answered: true,
      text: 'Moving or adding $0 changes nothing. Give me an amount — "$5k", or "5,000" — and I will project it.',
      followUps: ['Where should more budget go?'],
    };
  }

  /* "move / shift $X from A to B" */
  /* A budget move naming a channel this account does not have (off in
     Settings, or not in the connected account): say so, rather than "I could
     not turn that into a question". */
  if (/\b(move|shift|reallocat\w*|transfer|swap|add|put)\b/i.test(q)) {
    const lower = q.toLowerCase();
    const missing = CHANNEL_KEYS.filter((k) => !activeChannels().includes(k)
      && (lower.includes(CHANNEL_LABEL[k].toLowerCase()) || lower.includes(k.toLowerCase())));
    if (missing.length) {
      const names = missing.map((k) => CHANNEL_LABEL[k]).join(' and ');
      return {
        answered: true,
        text: `${names} ${missing.length === 1 ? 'is' : 'are'} not part of this account right now — switched off in Settings, or not in the connected ad account — so there is no cost per lead to project from. I can compare the channels you do run: ${activeChannels().map((k) => CHANNEL_LABEL[k]).join(', ')}.`,
        followUps: ['Where should more budget go?'],
      };
    }
  }

  if (/\b(move|shift|reallocat\w*|transfer|swap)\b/i.test(q) && named.length >= 2) {
    const amt = amount ?? Math.round(defaultExtra(range) / 2);
    const [from, to] = named;
    const m = moveBudget(amt, from, to, range);
    const verdict = m.net >= 0
      ? `About ${leads(m.net)} more leads overall.`
      : `About ${leads(-m.net)} FEWER leads overall — ${CHANNEL_LABEL[to]} costs more per lead.`;
    return {
      answered: true,
      text: [
        `Moving ${money(amt)} from ${CHANNEL_LABEL[from]} to ${CHANNEL_LABEL[to]} over ${rangeOver(range)}:`,
        `• ${CHANNEL_LABEL[from]} loses about ${leads(m.lost)} leads.`,
        `• ${CHANNEL_LABEL[to]} gains about ${leads(m.gained)}.`,
        `• ${verdict}`,
        ...(m.hold ? [`⚠️ Careful: ${CHANNEL_LABEL[to]} — ${m.hold}.`] : []),
        `Assuming ${ASSUME_CAC_HOLDS}`,
        `And: ${ASSUME_LAST_TOUCH}`,
      ].join('\n'),
      evidence: [
        { label: `${CHANNEL_LABEL[from]} CAC`, value: cacOf(totals(from, range).cac), channel: from },
        { label: `${CHANNEL_LABEL[to]} CAC`, value: cacOf(totals(to, range).cac), channel: to },
        { label: 'Net leads', value: `${m.net >= 0 ? '+' : '−'}${leads(Math.abs(m.net))}` },
      ],
      followUps: [
        'Where should more budget go?',
        `What would you do about ${CHANNEL_LABEL[from]}?`,
        'What can this data not tell me?',
      ],
    };
  }

  const scaling = /more (budget|money|spend)|extra (budget|money|spend)|where should (more|extra|the next|another)|\bscale\b|\bgrow\b|get more (out )?of|double down|invest more|\badd\w*\s+\$|what if i (add|spend|put)/i;
  if (!scaling.test(q)) return undefined;

  const ch = named[0] ?? (subject?.kind === 'channel' ? (subject.id as ChannelName) : undefined);

  /* "how do I get more of what's working on Affiliates?" -- inside one channel. */
  if (ch) {
    const w = scaleWithin(ch, range);
    if (w.options.length === 0) {
      return { answered: true, text: `${CHANNEL_LABEL[ch]} has no running campaigns to put more money behind.`,
        followUps: ['Where should more budget go?'] };
    }
    const best = w.options[0];
    const jump = delta(ch, 'Leads', 7);
    return {
      answered: true,
      text: [
        `To grow ${CHANNEL_LABEL[ch]}, push the campaign that buys leads cheapest:`,
        ...w.options.slice(0, 3).map((o, i) =>
          `${i + 1}. ${o.name} — ${cacOf(o.cac)} a lead. +25% budget (about ${money(o.spend * 0.25)}) ≈ ${leads(o.plusLeads)} more leads.`),
        ...(w.hold ? [`⚠️ Hold first: ${w.hold}.`] : []),
        ...(!w.hold && jump >= 15
          ? [`Its leads jumped ${jump}% this week, so start with ${w.options[0].name}: raise it, and pull back if a week comes in above ${cacOf(w.options[0].cac * 1.15)} a lead.`]
          : []),
        `Assuming ${ASSUME_CAC_HOLDS}`,
      ].join('\n'),
      evidence: w.options.slice(0, 3).map((o) => ({ label: `${o.name} CAC`, value: cacOf(o.cac), channel: ch })),
      followUps: [
        `Why is ${CHANNEL_LABEL[ch]} CAC ${delta(ch, 'CAC', 7) > 0 ? 'up' : 'down'}?`,
        'Where should more budget go?',
        `What would you do about ${best.name}?`,
      ],
    };
  }

  /* "where should more budget go?" -- across channels. */
  const extra = amount ?? defaultExtra(range);
  const s = whereToScale(extra, range);
  const go = s.options.filter((o) => !o.hold);
  const held = s.options.filter((o) => o.hold);
  if (go.length === 0) {
    return { answered: true, text: 'Hold the extra budget this week: every channel with spend has a cost spike. Add it once a channel has a full week back at its usual cost per lead.' };
  }
  return {
    answered: true,
    text: [
      `An extra ${money(extra)} over ${rangeOver(range)} buys the most leads here:`,
      ...go.slice(0, 3).map((o, i) =>
        `${i + 1}. ${CHANNEL_LABEL[o.channel]} — ${cacOf(o.cac)} a lead ≈ ${leads(o.leads)} leads`
        + (o.room === undefined ? '.'
          : o.room > 0 ? `, and it has ${money(o.room)} of its budget unspent.`
          : `, but it is already ${money(-o.room)} over its budget.`)),
      ...held.map((o) => `⚠️ Not ${CHANNEL_LABEL[o.channel]} yet: ${o.hold}.`),
      `Splitting it across the top two is safer than one — each gets dearer as it grows.`,
      `Assuming ${ASSUME_CAC_HOLDS}`,
      `And: ${ASSUME_LAST_TOUCH}`,
    ].join('\n'),
    evidence: s.options.map((o) => ({ label: `${CHANNEL_LABEL[o.channel]} CAC`, value: cacOf(o.cac), channel: o.channel })),
    followUps: [
      `How do I scale ${CHANNEL_LABEL[go[0].channel]}?`,
      /* NOT "move money from the dearest channel to the cheapest" -- that is
         the podcast trap, and a suggested question is a nudge. */
      'What should I do next?',
      'What can this data not tell me?',
    ],
  };
}


/* ------------------------------------------------------------- compare -- */

function compareAnswer(q: string, range: Range): Answer | undefined {
  if (!/\bcompare\b|\bversus\b|\bvs\.?\b|against/i.test(q)) return undefined;
  const lower = q.toLowerCase();
  const named = CAMPAIGNS
    .map((c) => ({ c, i: lower.indexOf(c.name.toLowerCase()) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c);
  if (named.length < 2) return undefined;
  const cmp = compareCampaigns(named[0].id, named[1].id, range);
  if (!cmp) return undefined;
  const cac = cmp.rows.find((r) => r.metric === 'CAC')!;
  const roas = cmp.rows.find((r) => r.metric === 'ROAS')!;
  const ta = campaignTotals(cmp.a.id, range);
  const tb = campaignTotals(cmp.b.id, range);
  const cheaper = ta.cac > 0 && tb.cac > 0 ? (ta.cac < tb.cac ? cmp.a : cmp.b) : undefined;
  const gap = cheaper ? Math.round((Math.abs(ta.cac - tb.cac) / Math.max(ta.cac, tb.cac)) * 100) : 0;
  const lines = [
    `${cmp.a.name} pays ${cac.a ?? '—'} a lead; ${cmp.b.name} pays ${cac.b ?? '—'}.`,
    ...(cheaper ? [`${cheaper.name} is ${gap}% cheaper per lead over ${rangeOver(range)}.`] : []),
    `ROAS: ${roas.a ?? '—'} against ${roas.b ?? '—'}.`,
    ...(cmp.cacTrend.a >= 15 ? [`${cmp.a.name}'s CAC rose ${cmp.cacTrend.a}% this week — the gap may be moving.`] : []),
    ...(cmp.cacTrend.b >= 15 ? [`${cmp.b.name}'s CAC rose ${cmp.cacTrend.b}% this week — the gap may be moving.`] : []),
    ...(cmp.crossChannel
      ? ['They run on different channels, so this is a cost comparison, not attribution — last touch flatters the channel nearest the sale.']
      : ['Same channel, so they are measured the same way — a fair comparison.']),
  ];
  return {
    answered: true,
    text: lines.join('\n'),
    evidence: [
      { label: `${cmp.a.name} CAC`, value: cac.a ?? '—', channel: cmp.a.channel },
      { label: `${cmp.b.name} CAC`, value: cac.b ?? '—', channel: cmp.b.channel },
    ],
    followUps: [
      `What would you do about ${cmp.a.name}?`,
      `What would you do about ${cmp.b.name}?`,
      'Where should more budget go?',
    ],
  };
}


/* --------------------------------------------------------- commitments -- */

const dueLabel = (iso?: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

function line(c: Commitment): string {
  const who = c.ownerName ? ` — ${c.ownerName.split(' ')[0]}` : '';
  const when = c.due ? `${c.overdue ? ', overdue since' : ', due'} ${dueLabel(c.due)}` : '';
  return `• ${c.label}${who}${when}.`;
}

/**
 * Questions about the decisions queue: what was decided, whether it worked,
 * what is late, who owns what. Read from the queue itself -- never invented.
 */
function commitmentAnswer(q: string): Answer | undefined {
  const all = commitments();
  const owner = Object.values(MEMBERS).find((m) =>
    new RegExp(`\\b${m.name.split(' ')[0]}\\b`, 'i').test(q)
    && /\b(own|owns|working on|assigned|responsible|on (his|her|their) plate)\b/i.test(q));

  const asks = {
    decided: /what (have|did) (we|i) (decide|commit)|our decisions|my decisions\b(?! going)|decided so far|committed to|what.s on (my|our) (queue|plate)/i.test(q),
    record: /how (are|is) (my|our|the) (calls?|decisions?)|track record|did (it|they|that|those) work|what worked|scorecard/i.test(q),
    late: /overdue|what.s late|behind on|missed (the|a) (date|deadline)/i.test(q),
  };
  if (!owner && !asks.decided && !asks.record && !asks.late) return undefined;

  if (all.length === 0) {
    return {
      answered: true,
      text: 'Nothing is decided yet. When you accept a proposal or write a decision, I will track it here — who owns it, when it is due, and whether it worked.',
      followUps: ['What should I do next?', 'Where should more budget go?'],
    };
  }

  if (owner) {
    const theirs = all.filter((c) => c.owner === owner.id);
    return {
      answered: true,
      text: theirs.length === 0
        ? `${owner.name} doesn't own any decisions yet.`
        : [`${owner.name} owns ${theirs.length} decision${theirs.length === 1 ? '' : 's'}:`, ...theirs.slice(0, 5).map(line)].join('\n'),
      followUps: ["What's overdue?", 'How are my decisions going?'],
    };
  }

  if (asks.late) {
    const late = all.filter((c) => c.overdue);
    return {
      answered: true,
      text: late.length === 0
        ? 'Nothing is overdue.'
        : [`${late.length} decision${late.length === 1 ? ' is' : 's are'} overdue:`, ...late.slice(0, 5).map(line)].join('\n'),
      followUps: ['How are my decisions going?', 'What should I do next?'],
    };
  }

  if (asks.record) {
    const t = recordOf(all);
    const graded = all.filter((c) => ['met', 'missed', 'done', 'worked', 'didnt'].includes(c.status));
    const waiting = all.filter((c) => c.status === 'pending' || c.status === 'waiting');
    const noData = all.filter((c) => c.status === 'no-data').length;
    const ungraded = all.filter((c) => c.status === 'ungraded').length;
    return {
      answered: true,
      text: [
        `${t.good} worked, ${t.bad} didn't, ${t.open} still open.`,
        ...graded.slice(0, 3).map((c) => `• ${c.label}: ${c.grade}`),
        ...(waiting.length ? [`${waiting.length} still waiting for their check date or to happen.`] : []),
        ...(noData ? [`${noData} can't be graded yet — no new data since you decided.`] : []),
        ...(ungraded ? [`${ungraded} need you to say whether they worked — there's no single number for them.`] : []),
      ].join('\n'),
      followUps: ["What's overdue?", 'What should I do next?'],
    };
  }

  return {
    answered: true,
    text: [`${all.length} decision${all.length === 1 ? '' : 's'}, newest first:`, ...all.slice(0, 5).map(line),
      ...(all.length > 5 ? [`…and ${all.length - 5} more on the Decisions screen.`] : [])].join('\n'),
    followUps: ['How are my decisions going?', "What's overdue?"],
  };
}
