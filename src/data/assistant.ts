import {
  CHANNEL_LABEL, RANGE_LABEL, activeChannels, delta, formatMetric, totals,
  type Metric, type Range, type Scope,
} from './metrics';
import type { ChannelName } from '../styles/tokens';

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
  'Which channel has the best ROAS?',
  'Why is Meta CAC up?',
  'What should I cut?',
  'How much did we spend on TikTok?',
];

export function ask(question: string, range: Range): Answer {
  const q = question.trim();
  if (!q) return { text: '', answered: false };

  const metric = findMetric(q);
  const channels = findChannels(q);
  const period = RANGE_LABEL[range].toLowerCase();

  /* "what should I cut" — worst performer by CAC, with the money at stake. */
  if (/\bcut\b|\bpause\b|\bstop\b|\bkill\b|worst|underperform/i.test(q)) {
    const ranked = [...activeChannels()].sort((a, b) => totals(b, range).cac - totals(a, range).cac);
    const worst = ranked[0];
    const t = totals(worst, range);
    const blended = totals('all', range);
    const multiple = (t.cac / blended.cac).toFixed(1);
    return {
      answered: true,
      text: `${CHANNEL_LABEL[worst]} is the most expensive channel over the ${period}, at ${formatMetric('CAC', t.cac)} per lead — ${multiple}x the blended ${formatMetric('CAC', blended.cac)}. It is carrying ${formatMetric('Spend', t.spend)} for ${formatMetric('Leads', t.leads)} leads. Worth saying plainly: this is a cost comparison, not an attribution model. A channel can be expensive per lead and still be doing work further up the funnel that this view cannot see.`,
      evidence: [
        { label: `${CHANNEL_LABEL[worst]} CAC`, value: formatMetric('CAC', t.cac), channel: worst },
        { label: `${CHANNEL_LABEL[worst]} spend`, value: formatMetric('Spend', t.spend), channel: worst },
        { label: 'Blended CAC', value: formatMetric('CAC', blended.cac), channel: 'all' },
      ],
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
    answered: false,
    text: `I could not turn that into a question about this data. I can only answer from what is on these screens — spend, clicks, leads, sales, CAC and ROAS, by channel, over the selected range. I do not have campaign history, creative, audiences or anything outside this dashboard, so I would rather say that than guess.`,
  };
}
