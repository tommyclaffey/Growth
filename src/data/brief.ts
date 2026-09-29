import type { ChannelName } from '../styles/tokens';
import { flags, isOverdue } from './attention';
import { decisions } from './decisions';
import { grade, tally } from './grading';
import { changeThreshold, notifications, weekLabels } from './notifications';
import { activeChannels, type Range } from './metrics';

export type BriefTone = 'bad' | 'good' | 'warn' | 'info';

export interface BriefLine {
  tone: BriefTone;
  text: string;
}

export interface Brief {
  /** "Week of Aug 6 – Aug 12". */
  heading: string;
  lines: BriefLine[];
  /** Questions to ask next, shaped by what is in the brief. */
  asks: string[];
}

/**
 * ⭐ THE PARTNER SPEAKS FIRST.
 *
 * Opening the assistant used to show a paragraph about what it could do and
 * four fixed questions -- the same four every day, whatever had happened. A
 * thought partner does not wait to be asked what changed; it says so, and then
 * asks what you want to do about it.
 *
 * Built ONLY from what the rest of the product already says -- the notification
 * rules, the decision engine, the grading, the task dates -- so the brief cannot
 * disagree with any screen. It computes nothing new, which is the point: it is
 * the whole product in five lines, not a sixth source of truth.
 *
 * Deterministic and local, so it works on the deployed site with no model and
 * appears instantly rather than after a request.
 */
export function brief(range: Range = 30, channels: ChannelName[] = activeChannels()): Brief {
  const lines: BriefLine[] = [];
  const asks: string[] = [];

  /* 1. What moved this week -- the biggest first. */
  const moves = notifications(channels)
    .filter((n) => n.group === 'This week')
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0));
  for (const n of moves.slice(0, 2)) {
    lines.push({ tone: n.tone === 'bad' ? 'bad' : 'good', text: n.message });
    if (n.channel && n.metric) {
      asks.push(n.tone === 'bad' ? `What should I do about ${n.target.label}?` : `How do I get more of what's working on ${n.target.label}?`);
    }
  }
  if (moves.length === 0) {
    lines.push({ tone: 'info', text: `Nothing moved ${changeThreshold()}% or more this week. A quiet week is a real answer.` });
  }

  /* 2. What is waiting on you. */
  const all = decisions(range, channels);
  const taken = new Set(flags().filter((f) => f.kind === 'decision').map((f) => f.refId));
  const ready = all.filter((c) => c.tier === 1 && !taken.has(c.id)).length;
  const judgement = all.filter((c) => c.tier === 2 && !taken.has(c.id)).length;
  if (ready + judgement > 0) {
    lines.push({
      tone: 'info',
      text: `${ready} decision${ready === 1 ? '' : 's'} ready to act on`
        + (judgement ? `, ${judgement} that need${judgement === 1 ? 's' : ''} a judgement call.` : '.'),
    });
    asks.push('What should I do next?');
  }

  /* 3. What you committed to, and whether it is on time. */
  const decided = flags().filter((f) => f.kind === 'decision');
  const late = decided.filter((f) => isOverdue(f));
  if (late.length) {
    lines.push({ tone: 'warn', text: `${late.length} of your decisions ${late.length === 1 ? 'is' : 'are'} overdue.` });
    asks.unshift("What's overdue?");
  }
  if (decided.length) {
    const t = tally(decided.map((f) => grade(f)));
    lines.push({ tone: 'info', text: `Track record: ${t.good} worked, ${t.bad} didn't, ${t.open} still open.` });
    asks.push('How are my decisions going?');
  }

  /* 4. What the data cannot answer -- said up front, not buried. */
  const open = all.filter((c) => c.tier === 3);
  if (open.length) {
    lines.push({ tone: 'info', text: `${open.length} question${open.length === 1 ? '' : 's'} this data can't answer on its own.` });
  }

  /* Always offered: the scaling question -- the reason a growth team is here. */
  asks.push('Where should more budget go?');
  const w = weekLabels();
  return { heading: `Week of ${w.now}`, lines, asks: [...new Set(asks)].slice(0, 4) };
}
