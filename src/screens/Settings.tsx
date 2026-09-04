import { useState } from 'react';
import { setWorkspaceName } from '../data/profile';
import './screens.css';
import { setDemoState, useDemoState, type DemoState } from '../data/demoState';
import { Toggle } from '../components/Toggle/Toggle';
import { Badge } from '../components/Badge/Badge';
import { FormField } from '../components/FormField/FormField';
import { CHANNEL_KEYS, CHANNEL_LABEL } from '../data/metrics';
import { useChannels, toggleChannel } from '../data/channels';
import { ChannelWordmark } from '../components/ChannelWordmark/ChannelWordmark';
import { SlackConnect } from '../components/ChatPanel/SlackConnect';
import { useBackend } from '../data/backend';
import type { ChannelName } from '../styles/tokens';
import { AvatarUpload } from '../components/AvatarUpload/AvatarUpload';
import { AccountLinks } from '../components/AccountLinks/AccountLinks';
import { ME, ME_ROLE } from '../data/chat';


const SYNCED: Record<ChannelName, string> = {
  meta: '4 minutes ago', tiktok: '11 minutes ago', youtube: '6 minutes ago',
  affiliates: '2 minutes ago', paidSearch: '9 minutes ago', podcasts: 'Never',
};

export interface SettingsProps {
  theme: 'light' | 'dark';
  onThemeChange: (next: 'light' | 'dark') => void;
}

export function Settings({ theme, onThemeChange }: SettingsProps) {
  const demo = useDemoState();
  const backend = useBackend();
  const enabled = useChannels();
  const [connected, setConnected] = useState<Set<ChannelName>>(
    new Set(CHANNEL_KEYS.filter((k) => k !== 'podcasts')),
  );
  const [digest, setDigest] = useState(true);
  const [cacAlerts, setCacAlerts] = useState(true);
  const [pacing, setPacing] = useState(false);
  const [workspace, setWorkspace] = useState('Growth — Acquisition');
  const [digestTo, setDigestTo] = useState('growth@example.com');

  function toggleChannel2(key: ChannelName, next: boolean) {
    setConnected((prev) => {
      const s = new Set(prev);
      if (next) s.add(key); else s.delete(key);
      return s;
    });
  }

  return (
    <>
      <div className="gr-settings">
        <section className="gr-card">
          <header className="gr-card__header">
            <div className="gr-card__heading">
              <h3 className="gr-card__title gr-type-card-heading">Account</h3>
              <p className="gr-card__sub gr-type-caption">{ME.name} · {ME_ROLE}</p>
            </div>
          </header>
          <div className="gr-card__body">
            <AvatarUpload />
          </div>
        </section>

        <section className="gr-card">
          <header className="gr-card__header">
            <div className="gr-card__heading">
              <h3 className="gr-card__title gr-type-card-heading">Slack account</h3>
              <p className="gr-card__sub gr-type-caption">
                Connect your own Slack account. Growth reads and posts as you.
              </p>
            </div>
          </header>
          <div className="gr-card__body">
            <AccountLinks />
          </div>
        </section>

        {/* Moved here from the chat panel. Connecting a workspace and picking
            the channel to mirror is setup done once — it does not belong in a
            surface used every day to read messages. */}
        <section className="gr-card">
          <header className="gr-card__header">
            <div className="gr-card__heading">
              <h3 className="gr-card__title gr-type-card-heading">Slack workspace</h3>
              <p className="gr-card__sub gr-type-caption">
                One conversation in Growth can mirror a Slack channel. Everything
                else stays here.
              </p>
            </div>
          </header>
          <div className="gr-card__body">
            <SlackConnect onConnected={() => { /* Settings shows status, not a thread */ }} />
          </div>
        </section>

        <section className="gr-card">
          <header className="gr-card__header">
            <div className="gr-card__heading">
              <h3 className="gr-card__title gr-type-card-heading">Channels</h3>
              <p className="gr-card__sub gr-type-caption">
                Switching one off removes it from the whole product — the blend,
                the tables, the picker and its own page.
              </p>
            </div>
          </header>

          {CHANNEL_KEYS.map((key) => {
            const isOn = connected.has(key);
            const runs = enabled.includes(key);
            return (
              <div key={key} className={`gr-setting-row ${runs ? '' : 'is-off'}`}>
                <span className="gr-setting-row__channel">
                  {/* The channel named the way the design names it — a lockup
                      for the three that are products, the Google Ads mark
                      beside "Paid Search" because the channel is not called
                      Google Ads, the channel mark for the two that have no
                      product behind them. */}
                  <ChannelWordmark channel={key} name={CHANNEL_LABEL[key]} size="sm" />
                </span>

                <span className="gr-setting-row__text gr-type-caption">
                  {!runs ? 'Not in use' : isOn ? `Synced ${SYNCED[key].toLowerCase()}` : 'Not connected'}
                </span>

                {runs && isOn && SYNCED[key] === 'Never' && <Badge label="Sync failed" tone="bad" />}

                {/* Connecting is only offered for a channel this account runs.
                    Offering to connect something they have said they do not do
                    is the noise the switch exists to remove. */}
                {runs && (
                  isOn ? (
                    <button type="button" className="gr-setting-row__connect gr-type-caption"
                            onClick={() => toggleChannel2(key, false)}>
                      Disconnect
                    </button>
                  ) : (
                    /* A real redirect to that platform's own consent screen —
                       Meta to Meta, Google Ads to Google. It used to flip a
                       local switch and report "Synced 4 minutes ago", which is
                       a state that was never established.

                       On the deployed static build there is no /api/connect to
                       redirect to, so the link would be a 404. A disabled
                       control that says why beats a live-looking one that
                       breaks — the whole reason this stopped being a fake
                       toggle in the first place. */
                    backend === false ? (
                      <span className="gr-setting-row__connect is-unavailable gr-type-caption"
                            title="Connecting an ad account needs a server for OAuth">
                        Connect in local build
                      </span>
                    ) : (
                      <a className="gr-setting-row__connect is-primary gr-type-caption"
                         href={`/api/connect/${key}`}>
                        Connect {CHANNEL_LABEL[key]}
                      </a>
                    )
                  )
                )}

                <Toggle
                  checked={runs}
                  onChange={(next) => toggleChannel(key, next, enabled)}
                  label={`${CHANNEL_LABEL[key]} in use`}
                  labelHidden
                />
              </div>
            );
          })}
        </section>

        <section className="gr-card">
          <header className="gr-card__header">
            <h3 className="gr-card__title gr-type-card-heading">Alerts</h3>
          </header>

          <div className="gr-setting-row">
            <span className="gr-setting-row__text">
              <strong className="gr-type-body-medium">Daily digest</strong>
              <span className="gr-type-caption">One summary each morning at 07:00</span>
            </span>
            <Toggle checked={digest} onChange={setDigest} label="Daily digest" labelHidden />
          </div>

          <div className="gr-setting-row">
            <span className="gr-setting-row__text">
              <strong className="gr-type-body-medium">CAC threshold</strong>
              <span className="gr-type-caption">Alert when blended CAC rises more than 20% week over week</span>
            </span>
            <Toggle checked={cacAlerts} onChange={setCacAlerts} label="CAC threshold alerts" labelHidden />
          </div>

          <div className="gr-setting-row">
            <span className="gr-setting-row__text">
              <strong className="gr-type-body-medium">Pacing warnings</strong>
              <span className="gr-type-caption">Alert when a channel falls behind its monthly target</span>
            </span>
            <Toggle checked={pacing} onChange={setPacing} label="Pacing warnings" labelHidden />
          </div>
        </section>

        <section className="gr-card">
          <header className="gr-card__header">
            <h3 className="gr-card__title gr-type-card-heading">Workspace</h3>
          </header>
          <div className="gr-settings__fields">
            {/* The hint used to be false in both halves: the sidebar hardcoded
                GROWTH and the CSV never read this. Both are wired now, so the
                field does what it says. */}
            <FormField label="Workspace name" value={workspace}
                       onChange={(v) => { setWorkspace(v); setWorkspaceName(v); }}
                       hint="Shown in the sidebar and in exported file names" />
            <FormField label="Digest recipients" type="email" value={digestTo} onChange={setDigestTo}
                       placeholder="name@company.com"
                       error={digestTo.length > 0 && !digestTo.includes('@')
                         ? 'Enter a valid email address' : undefined} />
          </div>
        </section>

        <section className="gr-card">
          <header className="gr-card__header">
            <h3 className="gr-card__title gr-type-card-heading">Appearance</h3>
          </header>

          <div className="gr-setting-row">
            <span className="gr-setting-row__text">
              <strong className="gr-type-body-medium">Dark mode</strong>
              <span className="gr-type-caption">
                Every colour resolves through a token, so this switches the whole system at once
              </span>
            </span>
            <Toggle
              checked={theme === 'dark'}
              onChange={(next) => onThemeChange(next ? 'dark' : 'light')}
              label="Dark mode"
              labelHidden
            />
          </div>
        </section>

        {/* Labelled as a demonstration, because that is what it is.

            The loading, error and empty states are built and were unreachable:
            the data layer is synchronous seeded computation, so there is no
            request to be slow and nothing to fail. Faking latency with a
            setTimeout would have been worse -- it slows the product
            permanently to show something occasionally, and it misrepresents
            where the states come from. */}
        <section className="gr-card">
          <h2 className="gr-type-section">Component states</h2>
          <p className="gr-type-caption gr-settings__hint">
            The dashboard&rsquo;s data is generated locally, so it never loads or fails on its own.
            Switch states here to see how the KPI cards and chart behave. Resets on reload.
          </p>

          <div className="gr-setting-row">
            <span className="gr-setting-row__text">
              <strong className="gr-type-body-medium">Simulate state</strong>
              <span className="gr-type-caption">Applies to the Overview and channel screens</span>
            </span>
            <div className="gr-demo-states" role="radiogroup" aria-label="Simulate component state">
              {(['ready', 'loading', 'error', 'empty'] as DemoState[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={demo === v}
                  className={`gr-demo-states__btn ${demo === v ? 'is-on' : ''}`}
                  onClick={() => setDemoState(v)}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
