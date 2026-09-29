import { commitments } from './commitments';
import type { Note } from './notifications';

/**
 * What happened to your DECISIONS, as notifications.
 *
 * ⭐ The feed knew what the numbers did and nothing about what the team did
 * about them. A decision going overdue, or turning out to have worked, is
 * exactly the kind of thing a notification is for -- and it lived only on a
 * screen you had to think to open.
 *
 * Derived from the same grades and due dates the Decisions screen shows, so
 * the two cannot disagree. Kept out of `notifications()` on purpose: the
 * decision engine reads that function, and the engine must not take input
 * from its own outcomes.
 *
 * Only events worth interrupting for: late, worked, missed, or a check date
 * that arrived with nothing to check against. A grade the PERSON gave is not
 * news to them, so it is not here.
 */
export function decisionEvents(today: Date = new Date()): Note[] {
  const out: Note[] = [];
  for (const c of commitments(undefined, today)) {
    const base = {
      kind: 'decision' as const,
      group: 'Your decisions' as const,
      target: { kind: 'account' as const, id: 'decisions', label: 'Decisions' },
      opensDecisions: true,
    };
    const who = c.ownerName ? `${c.ownerName.split(' ')[0]}'s` : 'Your';
    if (c.overdue) {
      out.push({ ...base, id: `dec:overdue:${c.refId}`, tone: 'bad',
        message: `${who} decision is overdue: ${c.label}.`, short: `Overdue: ${c.label}` });
    }
    if (c.status === 'met' || c.status === 'done') {
      out.push({ ...base, id: `dec:worked:${c.refId}`, tone: 'good',
        message: `It worked: ${c.label}. ${c.grade}`, short: `Worked: ${c.label}` });
    } else if (c.status === 'missed') {
      out.push({ ...base, id: `dec:missed:${c.refId}`, tone: 'bad',
        message: `It missed: ${c.label}. ${c.grade}`, short: `Missed: ${c.label}` });
    } else if (c.status === 'no-data') {
      out.push({ ...base, id: `dec:nodata:${c.refId}`, tone: 'warn',
        message: `Check date reached, nothing to check yet: ${c.label}. ${c.grade}`, short: `Can't grade yet: ${c.label}` });
    }
  }
  return out;
}
