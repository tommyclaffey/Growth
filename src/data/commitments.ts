import { flags, isOverdue, isOwnDecision, type Flag } from './attention';
import { MEMBERS } from './chat';
import { grade, tally, type GradeStatus } from './grading';

/**
 * What the team has committed to -- the decisions queue, as something the
 * assistant can talk about.
 *
 * ⭐ A thought partner that knows the numbers but not what you decided about
 * them is half a partner. "What did we decide?", "is it working?", "what is
 * late?", "what does Jess own?" are the questions a growth lead asks on a
 * Monday, and until now the assistant could answer none of them.
 *
 * Plain data, built in the BROWSER (the queue lives in localStorage) and sent
 * to the server with each question -- the server has no storage of its own,
 * which is the same reason decision findings are sent rather than recomputed.
 */

export interface Commitment {
  refId: string;
  label: string;
  scope?: string;
  /** "Your decision" vs one accepted from the engine. */
  written: boolean;
  owner?: string;
  ownerName?: string;
  due?: string;
  overdue: boolean;
  status: GradeStatus;
  /** The grade's own sentence -- "Pace to plan 64% when you decided. Check in 7 days." */
  grade: string;
  decidedAt: number;
}

export function commitments(from: Flag[] = flags(), today: Date = new Date()): Commitment[] {
  return from
    .filter((f) => f.kind === 'decision')
    .sort((a, b) => b.at - a.at)
    .map((f) => {
      const g = grade(f, today);
      return {
        refId: f.refId,
        label: f.label,
        scope: f.scope?.join(' › ') ?? f.target?.label,
        written: isOwnDecision(f),
        owner: f.owner,
        ownerName: f.owner ? MEMBERS[f.owner]?.name : undefined,
        due: f.due,
        overdue: isOverdue(f, today),
        status: g.status,
        grade: g.text,
        decidedAt: f.at,
      };
    });
}

export function recordOf(list: Commitment[]) {
  return tally(list.map((c) => ({ status: c.status, text: c.grade })));
}
