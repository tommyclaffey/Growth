import { useState } from 'react';
import './screens.css';
import { Toggle } from '../components/Toggle/Toggle';
import { Badge } from '../components/Badge/Badge';
import { FormField } from '../components/FormField/FormField';
import { CHANNEL_KEYS, CHANNEL_LABEL } from '../data/metrics';
import { useChannels, toggleChannel } from '../data/channels';
import { ChannelWordmark } from '../components/ChannelWordmark/ChannelWordmark';
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
                       a state that was never established. */
                    <a className="gr-setting-row__connect is-primary gr-type-caption"
                       href={`/api/connect/${key}`}>
                      Connect {CHANNEL_LABEL[key]}
                    </a>
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
            <FormField label="Workspace name" value={workspace} onChange={setWorkspace}
                       hint="Shown in the sidebar and on exports" />
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
      </div>
    </>
  );
}
