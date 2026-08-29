import { useState } from 'react';
import './screens.css';
import { Toggle } from '../components/Toggle/Toggle';
import { Button } from '../components/Button/Button';
import { Badge } from '../components/Badge/Badge';
import { CHANNEL_KEYS, CHANNEL_LABEL } from '../data/metrics';
import type { ChannelName } from '../styles/tokens';

const CSS_CHANNEL: Record<string, string> = {
  meta: 'meta', tiktok: 'tiktok', youtube: 'youtube',
  affiliates: 'affiliates', paidSearch: 'paid-search', podcasts: 'podcasts',
};

const SYNCED: Record<ChannelName, string> = {
  meta: '4 minutes ago', tiktok: '11 minutes ago', youtube: '6 minutes ago',
  affiliates: '2 minutes ago', paidSearch: '9 minutes ago', podcasts: 'Never',
};

export interface SettingsProps {
  theme: 'light' | 'dark';
  onThemeChange: (next: 'light' | 'dark') => void;
}

export function Settings({ theme, onThemeChange }: SettingsProps) {
  const [connected, setConnected] = useState<Set<ChannelName>>(
    new Set(CHANNEL_KEYS.filter((k) => k !== 'podcasts')),
  );
  const [digest, setDigest] = useState(true);
  const [cacAlerts, setCacAlerts] = useState(true);
  const [pacing, setPacing] = useState(false);

  function toggleChannel(key: ChannelName, next: boolean) {
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
            <h3 className="gr-card__title gr-type-card-heading">Channels</h3>
            <Button variant="ghost">Add channel</Button>
          </header>

          {CHANNEL_KEYS.map((key) => {
            const isOn = connected.has(key);
            return (
              <div key={key} className="gr-setting-row">
                <span className="gr-setting-row__channel gr-type-body-medium">
                  <span className="gr-setting-row__dot"
                        style={{ background: `var(--channel-${CSS_CHANNEL[key]})` }}
                        aria-hidden="true" />
                  {CHANNEL_LABEL[key]}
                </span>
                <span className="gr-setting-row__text">
                  <span className="gr-type-caption">
                    {isOn ? `Synced ${SYNCED[key].toLowerCase()}` : 'Not connected'}
                  </span>
                </span>
                {isOn && SYNCED[key] === 'Never' && <Badge label="Sync failed" tone="bad" />}
                <Toggle
                  checked={isOn}
                  onChange={(next) => toggleChannel(key, next)}
                  label={`${CHANNEL_LABEL[key]} connection`}
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
