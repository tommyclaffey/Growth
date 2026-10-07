import { Avatar } from '../Avatar/Avatar';
import { ME } from '../../data/chat';
import { directory } from '../../data/conversations';
import { useAvatarFor } from '../../data/profile';

/**
 * Team -- everyone in this workspace, with their photo and job.
 *
 * The people were already there (task owners, report recipients, the chat)
 * but nowhere to be seen as a group, so a visitor met them one dropdown at a
 * time. Read from the same directory the pickers use: one list of people, not
 * a second copy that could disagree with them.
 */
export function TeamCard() {
  const avatarFor = useAvatarFor();
  const people = directory();
  /* You first, then everyone else in the order they joined. */
  const ordered = [...people.filter((m) => m.id === ME.id), ...people.filter((m) => m.id !== ME.id)];

  return (
    <section className="gr-card" aria-labelledby="gr-team-title">
      <header className="gr-card__header">
        <div className="gr-card__heading">
          <h3 id="gr-team-title" className="gr-card__title gr-type-card-heading">Team</h3>
          <p className="gr-card__sub gr-type-caption">
            {ordered.length} people. They own tasks, get reports and share the chat.
          </p>
        </div>
      </header>
      <ul className="gr-card__body gr-team">
        {ordered.map((m) => (
          <li key={m.id} className="gr-setting-row">
            <Avatar initials={m.initials} hue={m.hue} size={36} name={m.name} src={avatarFor(m)} />
            <span className="gr-setting-row__text">
              <strong className="gr-type-body-medium">{m.name}{m.id === ME.id ? ' (you)' : ''}</strong>
              {m.role && <span className="gr-type-caption">{m.role}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
