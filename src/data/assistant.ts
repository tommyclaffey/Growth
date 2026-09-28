import {
  CHANNEL_LABEL, RANGE_LABEL, activeChannels, delta, formatMetric, totals,
  type Metric, type Range, type Scope,
} from './metrics';
import type { ChannelName } from '../styles/tokens';
import { decisions, decisionsFor, limitsFor, type Candidate, type Target } from './decisions';
import { CAMPAIGNS } from './campaigns';
import { creativeById, creativesFor } from './creative';

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
  decisions?: Takeable[];
}

export interface Takeable {
  id: string;
  action: string;
  tier: 1 | 2;
  /**
   * The channel it belongs to, so the row can carry the mark.
   *
   * ⚠️ A decision named only by its action loses which account it touches. "Decide
   * on Non-brand — High Intent" and "Review pacing" look like the same KIND of
   * thing in a list, and one is a Paid Search campaign while the other is the
   * whole account. The card on the Decisions screen shows the mark; the button
   * row in the panel did not, so the same decision was identified two different
   * ways depending on where you met it.
   */
  channel?: ChannelName;
  /** What it points at, in words — "Paid Search", or the campaign's name. */
  context?: string;
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
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      action: c.action,
      tier: c.tier,
      channel: c.channel,
      context: c.target.kind === 'account' ? 'This account' : c.target.label,
    }));
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
  return c.evidence.slice(0, 4).map((e) => ({
    label: e.label, value: e.value, channel: c.channel,
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
  const period = RANGE_LABEL[range].toLowerCase();

  const found = decisions(range);

  /* "what would you do about X" -- the decision, scoped to one subject.

     Placed BEFORE the "what's going on" branch because "what would you do about
     Meta" contains no "what's going on" but does name a subject; routed the
     other way it would answer the wrong question. */
  if (/what would you do|what.s the (call|move|decision)|your recommendation/i.test(q)) {
    const campaignFor = subject?.kind === 'campaign'
      ? CAMPAIGNS.find((c) => c.id === subject.id)
      : CAMPAIGNS.find((c) => q.toLowerCase().includes(c.name.toLowerCase().slice(0, 14)));
    const chFor = subject?.kind === 'channel'
      ? (subject.id as ChannelName) : findChannels(q)[0];

    const tgt: Target = subject?.kind === 'ad' ? subject
      : campaignFor ? { kind: 'campaign', id: campaignFor.id, label: campaignFor.name }
      : chFor ? { kind: 'channel', id: chFor, label: CHANNEL_LABEL[chFor] }
      : { kind: 'account', id: 'account', label: 'this account' };

    const mine = decisionsFor(tgt, range);
    const act = mine.filter((c) => c.tier !== 3);
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
        followUps: ['What should I do next?', 'What can this data not tell me?'],
      };
    }

    return {
      answered: true,
      text: [
        act.length === 1
          ? `One call on ${tgt.label}:`
          : `${act.length} calls on ${tgt.label}, best-supported first:`,
        ...act.slice(0, 3).map((c, i) => `${i + 1}. ${speak(c)}`),
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
        : CAMPAIGNS.find((c) => q.toLowerCase().includes(c.name.toLowerCase().slice(0, 14)));

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

    const mine = decisionsFor(target, range);
    const actionable = mine.filter((c) => c.tier !== 3);
    const questions = mine.filter((c) => c.tier === 3);
    const limits = limitsFor(target.kind);

    /* The numbers first, because that is what they are looking at. */
    const scope: Scope = target.kind === 'channel' ? (target.id as ChannelName) : 'all';
    const t = totals(scope, range);
    const head = target.kind === 'ad'
      ? `“${target.label}” — an ad in ${campaign?.name ?? 'this account'}, over the ${period}.`
      : target.kind === 'campaign'
      ? `${target.label} over the ${period}.`
      : `${target.label} over the ${period}: ${formatMetric('Spend', t.spend)} spend, `
        + `${formatMetric('Leads', t.leads)} leads, ${formatMetric('CAC', t.cac)} CAC.`;

    const body: string[] = [head];

    if (actionable.length > 0) {
      body.push(actionable.length === 1 ? 'One thing I can act on:' : `${actionable.length} things I can act on:`);
      body.push(...actionable.slice(0, 3).map((c) => speak(c)));
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
        { label: `${target.label} CAC`, value: formatMetric('CAC', t.cac), channel: scope },
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
    const actionable = found.filter((c) => c.tier !== 3);
    if (actionable.length === 0) {
      return {
        answered: true,
        text: `Nothing in this data supports an action right now. That is a real answer rather than an empty one — I would rather say so than manufacture a recommendation.`,
        followUps: ['What can this data not tell me?'],
      };
    }
    const top = actionable.slice(0, 3);
    return {
      answered: true,
      /* ⚠️ Newline-delimited, not one paragraph. The first version returned all
         three findings as a single block of prose and it was unreadable, which
         defeats the point of a conversational surface. The panel splits on blank
         lines. */
      text: [
        `${top.length === 1 ? 'One thing' : `${top.length} things`} over the ${period}, strongest evidence first.`,
        ...top.map((c, i) => `${i + 1}. ${speak(c)}`),
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
  if (/\bcut\b|\bpause\b|\bstop\b|\bkill\b|worst|underperform/i.test(q)) {
    const pauses = found.filter((c) => c.kind === 'spend-return-mismatch');
    const gap = found.find((c) => c.tier === 3);

    if (pauses.length > 0) {
      return {
        answered: true,
        text: [
          `At the ad level, yes.`,
          speak(pauses[0]),
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

  /* "why <an action>" — the argument behind one recommendation. */
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
      text: `${CHANNEL_LABEL[first]} has the ${superlative} ${metric} over the ${period} at ${formatMetric(metric, valueOf(first, metric, range))}${tail}.`,
      evidence: ranked.slice(0, 3).map((k) => ({
        label: `${CHANNEL_LABEL[k]} ${metric}`,
        value: formatMetric(metric, valueOf(k, metric, range)),
        channel: k,
      })),
    };
  }

  /* "why is X up" — direction and size, and an honest note about cause. */
  if (metric && /\bwhy\b|\bup\b|\bdown\b|\bris|\bfall|\bchang|\bmov/i.test(q)) {
    const scope: Scope = channels.length > 0 ? channels[0] : 'all';
    const change = delta(scope, metric, range);
    const value = valueOf(scope, metric, range);
    const name = scope === 'all' ? 'Blended' : CHANNEL_LABEL[scope as ChannelName];
    const dir = change === 0 ? 'flat' : change > 0 ? `up ${change}%` : `down ${Math.abs(change)}%`;
    return {
      answered: true,
      text: `${name} ${metric} is ${formatMetric(metric, value)} over the ${period}, ${dir} against the preceding period. I can tell you that it moved and by how much. I cannot tell you why — this data has no campaign changes, creative refreshes or auction pressure in it, so anything I said about cause would be invention.`,
      evidence: [
        { label: `${name} ${metric}`, value: formatMetric(metric, value), channel: scope },
        { label: 'Change vs prior period', value: `${change > 0 ? '+' : ''}${change}%`, channel: scope },
      ],
    };
  }

  /* "how much did we spend on X" — a lookup. */
  if (metric) {
    const scope: Scope = channels.length > 0 ? channels[0] : 'all';
    const name = scope === 'all' ? 'All channels' : CHANNEL_LABEL[scope as ChannelName];
    return {
      answered: true,
      text: `${name} ${metric} over the ${period} is ${formatMetric(metric, valueOf(scope, metric, range))}.`,
      evidence: [{
        label: `${name} ${metric}`,
        value: formatMetric(metric, valueOf(scope, metric, range)),
        channel: scope,
      }],
    };
  }

  /* Nothing matched. Say so. */
  return {
    followUps: ['What should I do next?', 'What can this data not tell me?'],
    answered: false,
    text: `I could not turn that into a question about this data. I can only answer from what is on these screens — spend, clicks, leads, sales, CAC and ROAS, by channel, over the selected range. I do not have campaign history, creative, audiences or anything outside this dashboard, so I would rather say that than guess.`,
  };
}
