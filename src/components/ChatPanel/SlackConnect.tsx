import { useEffect, useState } from 'react';
import {
  chooseChannel, listChannels, slackStatus, startInstall, switchWorkspace,
  type SlackChannel, type SlackStatus,
} from '../../data/slackClient';

/**
 * Connect-a-workspace flow.
 *
 * Three states, because there are genuinely three: the app has no OAuth
 * credentials, nobody has connected a workspace, or a workspace is connected
 * but no channel is picked. Collapsing them into one "not connected" message
 * would tell someone to click a button that cannot work.
 */
export function SlackConnect({ onConnected }: { onConnected: () => void }) {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void slackStatus().then(setStatus); }, []);

  const hasWorkspace = (status?.workspaces.length ?? 0) > 0;

  useEffect(() => {
    if (hasWorkspace && !status?.connected) void listChannels().then(setChannels);
  }, [hasWorkspace, status?.connected]);

  if (!status) return null;

  if (!status.configured) {
    return (
      <div className="gr-slack">
        <p className="gr-type-body">Slack isn’t set up for this app yet.</p>
        <p className="gr-type-caption gr-slack__hint">
          Needs <code>SLACK_CLIENT_ID</code>, <code>SLACK_CLIENT_SECRET</code> and{' '}
          <code>SLACK_REDIRECT_URI</code> in <code>.env.local</code>.
        </p>
      </div>
    );
  }

  if (!hasWorkspace) {
    return (
      <div className="gr-slack">
        <p className="gr-type-body">Connect a Slack workspace to see your team’s messages here.</p>
        <button type="button" className="gr-slack__cta gr-type-body-medium" onClick={startInstall}>
          Add to Slack
        </button>
        <p className="gr-type-caption gr-slack__hint">
          Growth reads one channel you choose and posts when you send. It never sees your DMs.
        </p>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="gr-slack">
        <p className="gr-type-body">Which channel should Growth read?</p>
        {channels === null && <p className="gr-type-caption gr-slack__hint">Loading channels…</p>}
        {channels?.length === 0 && (
          <p className="gr-type-caption gr-slack__hint">No public channels found in this workspace.</p>
        )}
        <ul className="gr-slack__list">
          {channels?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="gr-slack__channel gr-type-body"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  if (await chooseChannel(c.id, c.name)) onConnected();
                  setBusy(false);
                }}
              >
                <span>#{c.name}</span>
                {/* A channel the bot has not joined still works — it is joined
                    on selection — but saying so up front beats a silent pause. */}
                {!c.joined && <span className="gr-slack__tag gr-type-micro">will join</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /* Connected. With one workspace there is nothing to switch between, and the
     header subtitle already names the channel — so a pill repeating it is the
     same fact twice, two lines apart. Show the switcher only when it switches
     something. */
  const multiple = status.workspaces.length > 1;

  return (
    <div className="gr-slack gr-slack--compact">
      {multiple && status.workspaces.map((w) => (
        <button
          key={w.teamId}
          type="button"
          className={`gr-slack__ws gr-type-caption ${w.teamId === status.active ? 'is-active' : ''}`}
          onClick={async () => { await switchWorkspace(w.teamId); onConnected(); }}
        >
          {w.teamName}{w.channelName ? ` · #${w.channelName}` : ''}
        </button>
      ))}
      <button type="button" className="gr-slack__add gr-type-caption" onClick={startInstall}>
        + Add workspace
      </button>
    </div>
  );
}
