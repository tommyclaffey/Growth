import type { ChannelName } from '../styles/tokens';
import { campaignById, campaignTotals } from './campaignSeries';
import { stageOf } from './campaignStatus';
import { creativeById, creativeTotals } from './creative';
import type { Candidate } from './decisions';
import { budgetForRange } from './profile';
import { activeChannels, formatMetric, suppliedChannels, totals, type Range } from './metrics';

/**
 * ⭐ Grading -- the decision maker keeps score of itself.
 *
 * Step 5 of the north star: *"expected vs actual once the check date passes.
 * Nobody else's portfolio dashboard keeps score of its own recommendations."*
 *
 * When a decision is taken, the ONE number it is meant to move is captured as a
 * baseline, with the date to check it on. From then on the card can say whether
 * it worked.
 *
 * ⚠️ HONESTY RULES, because a scorecard is the easiest place in the product to
 * lie:
 *
 *   1. A number is compared only after its check date. Before that it is
 *      pending -- a verdict on day two of a thirty-day window is noise.
 *   2. If the number has not moved at all, the verdict is "no new data", never
 *      "missed". The seeded account is frozen on Aug 12, so today EVERY numeric
 *      grade lands here -- and saying so is the point. The same code grades
 *      real data the day an ad account is connected.
 *   3. A state change grades immediately: "decide on the campaign in Review"
 *      is done the moment it leaves Review. No date to wait for.
 *   4. What cannot be measured -- an investigation, a decision you wrote -- is
 *      graded by the person. Pretending a metric could answer it would be the
 *      tier-3 mistake again.
 */

export type Better = 'higher' | 'lower' | 'closer-to-one';

export interface Baseline {
  /** What to re-measure: "campaign-cac:c1", "stage-leaves:c8:Review"... */
  key: string;
  /** "Campaign CAC", "Leads on this ad" -- said on the card. */
  label: string;
  value: number;
  better: Better | 'state';
  /** The window the value was measured over, so the re-measure matches. */
  range: Range;
  /** ISO date. From the decision's own "Check on". */
  checkOn: string;
}

type Measure = { key: string; label: string; better: Baseline['better'] };

/** What a decision is meant to move -- or undefined when no number can say. */
function measureOf(c: Candidate): Measure | undefined {
  switch (c.kind) {
    case 'spend-return-mismatch': {
      /* Pausing a weak ad should bring the CAMPAIGN's cost per lead down. */
      const owner = creativeById(c.target.id);
      return owner ? { key: `campaign-cac:${owner.campaignId}`, label: 'Campaign CAC', better: 'lower' } : undefined;
    }
    case 'scale-winner':
      return { key: `ad-leads:${c.target.id}`, label: 'Leads on this ad', better: 'higher' };
    case 'reallocate-within-channel':
      return c.channel
        ? { key: `channel-leads:${c.channel}`, label: 'Channel leads', better: 'higher' }
        : undefined;
    case 'pacing':
      return { key: 'pace:account', label: 'Pace to plan', better: 'closer-to-one' };
    case 'stale-review':
      return { key: `stage-leaves:${c.target.id}:Review`, label: 'Out of Review', better: 'state' };
    /* An investigation, a structural change the seed cannot express, or a
       review of a stopped ad: a person grades these. */
    default:
      return undefined;
  }
}

/** The current value of a measure. Undefined if its subject is gone. */
export function measure(key: string, range: Range): number | undefined {
  const [kind, id] = key.split(':');
  /* 🐛 A subject that no longer exists was measured as ZERO -- an ad removed
     (or an account switched) graded "missed, 40 → 0"; a campaign gone from
     the list read as Active and graded "done". Gone is undefined: the person
     is asked how it went, which is the honest state. */
  if (kind === 'campaign-cac') return campaignById(id) ? campaignTotals(id, range).cac || undefined : undefined;
  if (kind === 'ad-leads') return creativeById(id) ? creativeTotals(id, range).leads : undefined;
  if (kind === 'channel-leads') return suppliedChannels().includes(id as ChannelName) ? totals(id as ChannelName, range).leads : undefined;
  if (kind === 'pace:account' || kind === 'pace') {
    const planned = budgetForRange(range);
    const spent = activeChannels().reduce((a, ch) => a + totals(ch, range).spend, 0);
    return planned > 0 ? spent / planned : undefined;
  }
  if (kind === 'stage-leaves') return campaignById(id) ? (stageOf(id) === key.split(':')[2] ? 0 : 1) : undefined;
  return undefined;
}

/** Captured at the moment of deciding. Undefined = graded by a person. */
export function baselineFor(c: Candidate, range: Range): Baseline | undefined {
  const m = measureOf(c);
  if (!m) return undefined;
  const value = measure(m.key, range);
  if (value === undefined) return undefined;
  return {
    ...m, value, range,
    checkOn: c.expectation?.checkOn ?? new Date().toISOString().slice(0, 10),
  };
}

export type GradeStatus =
  | 'pending'     // before the check date
  | 'met'         // moved the right way
  | 'missed'      // moved the wrong way
  | 'no-data'     // nothing has moved since the decision
  | 'done'        // a state decision that has happened
  | 'waiting'     // a state decision that has not happened yet
  | 'worked'      // graded by the person
  | 'didnt'       // graded by the person
  | 'ungraded';   // nothing to measure, not yet graded by the person

export interface Grade {
  status: GradeStatus;
  /** One line for the card. */
  text: string;
  now?: number;
}

const localDay = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function show(b: Baseline, v: number): string {
  if (b.key.startsWith('campaign-cac')) return formatMetric('CAC', v);
  if (b.key.startsWith('pace')) return `${Math.round(v * 100)}%`;
  return Math.round(v).toLocaleString();
}

export function grade(
  flag: { baseline?: Baseline; outcome?: 'worked' | 'didnt' },
  today: Date = new Date(),
): Grade {
  if (flag.outcome === 'worked') return { status: 'worked', text: 'You marked this as having worked.' };
  if (flag.outcome === 'didnt') return { status: 'didnt', text: 'You marked this as not having worked.' };

  const b = flag.baseline;
  if (!b) return { status: 'ungraded', text: 'No single number can grade this one. How did it go?' };

  const now = measure(b.key, b.range);
  if (now === undefined) return { status: 'ungraded', text: 'Its subject no longer exists. How did it go?' };

  if (b.better === 'state') {
    return now === 1
      ? { status: 'done', text: `${b.label} — done.`, now }
      : { status: 'waiting', text: `Not yet — still ${b.key.split(':')[2]}.`, now };
  }

  const from = show(b, b.value);
  const to = show(b, now);
  const t = localDay(today);
  if (t < b.checkOn) {
    const days = Math.ceil((new Date(b.checkOn).getTime() - new Date(t).getTime()) / 86_400_000);
    return { status: 'pending', text: `${b.label} ${from} when you decided. Check in ${days} day${days === 1 ? '' : 's'}.`, now };
  }

  /* Under 1% either way is not a result -- and with the seeded data frozen,
     it is exactly what every numeric grade finds. Say that, not "missed". */
  const rel = b.value !== 0 ? (now - b.value) / Math.abs(b.value) : 0;
  if (Math.abs(rel) < 0.01) {
    return { status: 'no-data', text: `${b.label} still ${to} — no new data since you decided.`, now };
  }
  const improved = b.better === 'higher' ? now > b.value
    : b.better === 'lower' ? now < b.value
    : Math.abs(1 - now) < Math.abs(1 - b.value);
  return {
    status: improved ? 'met' : 'missed',
    text: `${b.label} ${from} → ${to}.`,
    now,
  };
}

/** Counted for the track record above the Decided queue. */
export function tally(grades: Grade[]) {
  const good = grades.filter((g) => g.status === 'met' || g.status === 'done' || g.status === 'worked').length;
  const bad = grades.filter((g) => g.status === 'missed' || g.status === 'didnt').length;
  const open = grades.length - good - bad;
  return { good, bad, open };
}
