import {
  CHANNEL_LABEL, RANGE_LABEL, activeChannels, delta, formatMetric, totals,
  type Metric, type Range, type Scope,
} from './metrics';
import type { ChannelName } from '../styles/tokens';
import { decisions, type Candidate } from './decisions';

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

export function ask(question: string, range: Range): Answer {
  const q = question.trim();
  if (!q) return { text: '', answered: false };

  const metric = findMetric(q);
  const channels = findChannels(q);
  const period = RANGE_LABEL[range].toLowerCase();

  const found = decisions(range);

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
