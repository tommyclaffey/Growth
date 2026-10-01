import './TaskFields.css';
import { Avatar } from '../Avatar/Avatar';
import { MEMBERS } from '../../data/chat';
import { isOverdue, setTask, type Flag } from '../../data/attention';
import { notifyAssignment } from '../../data/teamMessages';
import { formatDue } from '../../data/dates';

export interface TaskFieldsProps {
  flag: Flag;
  /** Injected for tests. Overdue is a function of the date and TODAY. */
  today?: Date;
}

/* formatDue lives in data/dates.ts -- a component file that also exports
   helpers breaks Fast Refresh. */

/**
 * Who owns a decision, and by when.
 *
 * ⭐ G-008. A task is a FLAG WITH FIELDS -- these two controls write `owner` and
 * `due` onto the flag the decision already is. No second list, so nothing can
 * go out of step: remove the decision and its owner and date go with it.
 *
 * ⚠️ The smallest version that shows the idea. No reminders (they need a
 * backend), no task screen, no Slack post. The judgement worth defending in an
 * interview is "one object growing fields", not the CRUD.
 */
export function TaskFields({ flag, today = new Date() }: TaskFieldsProps) {
  const owner = flag.owner ? MEMBERS[flag.owner] : undefined;
  const late = isOverdue(flag, today);
  const set = (fields: { owner?: string | null; due?: string | null }) =>
    setTask(flag.kind, flag.refId, flag.label, fields);

  return (
    <div className={`gr-task ${late ? 'is-overdue' : ''}`}>
      <label className="gr-task__field">
        {/* The face, not just the name. Initials at 24px are how the rest of the
            product shows a person, so the owner is recognisable at a glance. */}
        {owner
          ? <Avatar initials={owner.initials} hue={owner.hue} src={owner.avatar} name={owner.name} size={24} />
          : <span className="gr-task__nobody" aria-hidden="true" />}
        <span className="gr-sr-only">Owner</span>
        <select
          className="gr-task__control gr-type-caption-med"
          value={flag.owner ?? ''}
          onChange={(e) => {
            const next = e.target.value || null;
            set({ owner: next });
            /* The owner hears about it -- in their DMs, with the decision
               attached. Only on a change of owner, never on a re-render. */
            if (next && next !== flag.owner) {
              notifyAssignment(next, {
                refId: flag.refId, label: flag.label, scope: flag.scope?.join(' › '), due: flag.due,
              });
            }
          }}
        >
          <option value="">Unassigned</option>
          {Object.values(MEMBERS).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      <label className="gr-task__field">
        <span className="gr-type-caption gr-task__label">Due</span>
        <input
          type="date"
          className="gr-task__control gr-type-caption-med"
          value={flag.due ?? ''}
          onChange={(e) => set({ due: e.target.value || null })}
        />
      </label>

      {/* Said in words, not only in red. Colour alone fails for anyone who
          cannot see it, and "overdue" is the whole point of the field. */}
      {late && flag.due && (
        <span className="gr-task__late gr-type-caption-med" role="status">
          Overdue — was due {formatDue(flag.due)}
        </span>
      )}
    </div>
  );
}
