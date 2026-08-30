import { useEffect, useState } from 'react';
import './AccountLinks.css';
import { Avatar } from '../Avatar/Avatar';
import { ME, MEMBERS } from '../../data/chat';
import { connectAs, listPeople, unlinkAccount, type Person } from '../../data/slackDirectory';
import { slackStatus } from '../../data/slackClient';
import { useAvatarFor } from '../../data/profile';

/**
 * Your Slack connection, and who else on the team has one.
 *
 * The first version of this was a row per person with a dropdown of Slack
 * accounts — which let one person declare that an account belonged to another.
 * That is not a link, it is an assertion, and it would let someone attribute
 * messages to a colleague who never agreed to it.
 *
 * A connection can only be made by the person it belongs to, through Slack's
 * own consent screen. So there is one control here — yours — and everyone else
 * is shown read-only, because their connection is theirs to make.
 */
export function AccountLinks() {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const avatarFor = useAvatarFor();

  async function load() {
    const status = await slackStatus();
    const active = status.workspaces.find((w) => w.teamId === status.active);
    setConnected(Boolean(active));
    setLinks(active?.links ?? {});
    if (active) setPeople(await listPeople());
    setReady(true);
  }

  useEffect(() => { void load(); }, []);

  if (!ready) return null;

  const mySlackId = links[ME.id];
  const mySlack = people.find((p) => p.id === mySlackId);
  const others = Object.values(MEMBERS).filter((m) => m.id !== ME.id);

  return (
    <div className="gr-links">
      <div className="gr-links__self">
        <Avatar initials={ME.initials} hue={ME.hue} size={36} src={avatarFor(ME)} name={ME.name} />
        <div className="gr-links__selftext">
          <span className="gr-type-body-medium">{ME.name}</span>
          <span className="gr-type-caption gr-links__status">
            {mySlackId
              /* Named, because "Connected" alone does not tell you *which*
                 account — and people have more than one Slack identity. */
              ? `Connected as ${mySlack?.name ?? mySlackId}`
              : connected
                ? 'Not connected to Slack'
                : 'No Slack workspace connected yet'}
          </span>
        </div>
        {mySlackId ? (
          <button type="button" className="gr-links__btn gr-type-caption" disabled={busy}
                  onClick={async () => { setBusy(true); await unlinkAccount(ME.id); await load(); setBusy(false); }}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="gr-links__btn is-primary gr-type-caption"
                  onClick={() => connectAs(ME.id)}>
            Connect Slack
          </button>
        )}
      </div>

      <div className="gr-links__team">
        <p className="gr-type-overline gr-links__label">Others on this account</p>
        {others.map((m) => (
          <div key={m.id} className="gr-links__row">
            <Avatar initials={m.initials} hue={m.hue} size={28} src={m.avatar} name={m.name} />
            <span className="gr-links__name gr-type-body">{m.name}</span>
            <span className={`gr-type-caption gr-links__state ${links[m.id] ? 'is-on' : ''}`}>
              {links[m.id] ? 'Connected' : 'Not connected'}
            </span>
          </div>
        ))}
        <p className="gr-type-caption gr-links__note">
          Only they can connect their own Slack — it goes through Slack’s sign-in,
          not through this screen.
        </p>
      </div>
    </div>
  );
}
