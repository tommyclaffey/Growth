import { useEffect, useState } from 'react';
import './AccountLinks.css';
import { Avatar } from '../Avatar/Avatar';
import { ME } from '../../data/chat';
import { connectAs, listPeople, unlinkAccount, type Person } from '../../data/slackDirectory';
import { slackStatus } from '../../data/slackClient';
import { SlackMark } from '../SlackMark/SlackMark';
import { useAvatarFor } from '../../data/profile';

/**
 * Your Slack connection.
 *
 * Yours only. An earlier version listed everyone with a dropdown of Slack
 * accounts, which let one person declare that an account belonged to another —
 * an assertion, not a link. A later one kept the list read-only, which was
 * still wrong for a different reason: whether a colleague has connected their
 * personal Slack is not something a personal account would know, and showing
 * it invents a fact the product does not have.
 *
 * A connection is made by the person it belongs to, through Slack's own
 * consent screen. So there is one control, and it is yours.
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
            <SlackMark size={14} />
            Connect to Slack
          </button>
        )}
      </div>

    </div>
  );
}
