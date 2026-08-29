import { useEffect, useState } from 'react';
import './AccountLinks.css';
import { Avatar } from '../Avatar/Avatar';
import { MEMBERS, type Member } from '../../data/chat';
import { linkAccount, listPeople, type Person } from '../../data/slackDirectory';
import { slackStatus } from '../../data/slackClient';

/**
 * Point a person in this product at their Slack account.
 *
 * The seeded cast and the workspace are two directories of the same people.
 * Unlinked, the same human appears twice — two names, two photos — and a
 * message from one is not recognisably from the other. A link makes them one
 * person: anything that account says in Slack arrives here under the name and
 * face this product already uses for them.
 */
export function AccountLinks() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    void (async () => {
      const status = await slackStatus();
      const active = status.workspaces.find((w) => w.teamId === status.active);
      setAvailable(Boolean(active));
      setLinks(active?.links ?? {});
      if (active) setPeople(await listPeople());
    })();
  }, []);

  async function set(person: Member, slackUserId: string) {
    setSaving(person.id);
    const next = { ...links };
    if (slackUserId) next[person.id] = slackUserId;
    else delete next[person.id];
    /* Optimistic: the select has already moved, so leaving the row stale until
       a round trip finishes would read as the control not working. */
    setLinks(next);
    await linkAccount(person.id, slackUserId || null);
    setSaving(null);
  }

  if (!available) {
    return (
      <p className="gr-type-caption gr-links__empty">
        Connect a Slack workspace to link accounts.
      </p>
    );
  }

  const cast = Object.values(MEMBERS);

  return (
    <div className="gr-links">
      {cast.map((m) => {
        /* Someone already claimed by another row cannot be claimed twice —
           two people mapped to one account makes attribution ambiguous. */
        const takenByOthers = new Set(
          Object.entries(links).filter(([id]) => id !== m.id).map(([, slackId]) => slackId),
        );
        return (
          <div key={m.id} className="gr-links__row">
            <Avatar initials={m.initials} hue={m.hue} size={28} src={m.avatar} name={m.name} />
            <span className="gr-links__name gr-type-body-medium">{m.name}</span>
            <select
              className="gr-links__select gr-type-body"
              aria-label={`Slack account for ${m.name}`}
              value={links[m.id] ?? ''}
              disabled={saving === m.id || people === null}
              onChange={(e) => void set(m, e.target.value)}
            >
              <option value="">Not linked</option>
              {(people ?? []).map((p) => (
                <option key={p.id} value={p.id} disabled={takenByOthers.has(p.id)}>
                  {p.name}{takenByOthers.has(p.id) ? ' — already linked' : ''}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
