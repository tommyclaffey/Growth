import { useMemo, useState } from 'react';
import { Sidebar, type NavKey } from './components/Sidebar/Sidebar';
import { Button } from './components/Button/Button';
import { KpiCard } from './components/KpiCard/KpiCard';
import { Chart } from './components/Chart/Chart';
import { InfoStrip } from './components/InfoStrip/InfoStrip';
import { ChannelTable, type ChannelRow } from './components/ChannelTable/ChannelTable';
import { CampaignTable } from './components/CampaignTable/CampaignTable';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { ChannelSwitcher } from './components/ChannelSwitcher/ChannelSwitcher';
import {
  CHANNEL_KEYS, CHANNEL_LABEL, delta, formatMetric, series, sparkline, totals, yTicks,
  type Metric, type Scope,
} from './data/metrics';
import type { ChannelName } from './styles/tokens';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [nav, setNav] = useState<NavKey>('overview');
  const [channel, setChannel] = useState<ChannelName | null>(null);
  const [metric, setMetric] = useState<Metric>('Spend');
  const [chatOpen, setChatOpen] = useState(false);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }

  const scope: Scope = channel ?? 'all';

  /* Everything below is derived from `scope` and `metric`. Changing either one
     recomputes the whole screen — the KPI values, the deltas, the sparklines,
     the chart series and its axis. Before this, the metric toggle changed a
     heading and nothing else, which is the single most common way a portfolio
     prototype gives itself away. */
  const view = useMemo(() => {
    const t = totals(scope);
    const data = series(scope, metric);
    return {
      totals: t,
      data,
      ticks: yTicks(metric, data),
      rows: CHANNEL_KEYS.map<ChannelRow>((key) => {
        const ct = totals(key);
        return {
          key,
          name: CHANNEL_LABEL[key],
          spend: formatMetric('Spend', ct.spend),
          leads: formatMetric('Leads', ct.leads),
          cac: formatMetric('CAC', ct.cac),
          roas: formatMetric('ROAS', ct.roas),
          delta: delta(key, metric),
          trend: sparkline(key, metric),
        };
      }),
    };
  }, [scope, metric]);

  const onChannelScreen = channel !== null;
  const title = onChannelScreen ? CHANNEL_LABEL[channel] : navTitle(nav);
  const sub = onChannelScreen
    ? `${view.rows.find((r) => r.key === channel)?.spend ?? ''} spend · last 30 days`
    : 'All channels · last 30 days';

  const showDashboard = nav === 'overview' || (nav === 'channels' && onChannelScreen);

  return (
    <div className="gr-app">
      <Sidebar active={nav} onNavigate={(k) => { setNav(k); setChannel(null); }} />

      <div className={`gr-main ${chatOpen ? 'is-chat-open' : ''}`}>
        <header className="gr-header">
          <div className="gr-toolbar">
            <div className="gr-toolbar__title">
              {onChannelScreen && (
                <button type="button" className="gr-crumb gr-type-caption" onClick={() => setChannel(null)}>
                  Channels <span aria-hidden="true">›</span> {title}
                </button>
              )}
              <h1 className="gr-type-page-title">{title}</h1>
              <p className="gr-type-caption">{sub}</p>
            </div>
            <div className="gr-toolbar__spacer" />
            <ChannelSwitcher
              value={channel}
              onChange={(next) => {
                setChannel(next);
                if (next) setNav('channels');
              }}
            />
            <Button variant="ghost" caret>Last 30 days</Button>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <Button variant="ghost" onClick={() => setChatOpen(!chatOpen)}>Chat</Button>
            <Button variant="primary">Export</Button>
          </div>
        </header>

        <main className="gr-content">
          {showDashboard && (
            <>
              <div className="gr-kpi-row">
                <KpiCard label="Total spend"
                         value={formatMetric('Spend', view.totals.spend)}
                         deltaPercent={delta(scope, 'Spend')}
                         sparkline={sparkline(scope, 'Spend')} />
                <KpiCard label="Total leads"
                         value={formatMetric('Leads', view.totals.leads)}
                         deltaPercent={delta(scope, 'Leads')}
                         sparkline={sparkline(scope, 'Leads')} />
                <KpiCard label={onChannelScreen ? 'CAC' : 'Blended CAC'}
                         value={formatMetric('CAC', view.totals.cac)}
                         deltaPercent={delta(scope, 'CAC')}
                         sparkline={sparkline(scope, 'CAC')} />
                <KpiCard label={onChannelScreen ? 'ROAS' : 'Blended ROAS'}
                         value={formatMetric('ROAS', view.totals.roas)}
                         deltaPercent={delta(scope, 'ROAS')}
                         sparkline={sparkline(scope, 'ROAS')} />
                <KpiCard label="Pace to target" value="64%" progress={0.64} />
              </div>

              <InfoStrip
                alerts={[
                  { id: 'meta',   label: 'Meta CAC ↑ 42% WoW',       tone: 'bad' },
                  { id: 'tiktok', label: 'TikTok pacing 18% behind', tone: 'warn' },
                  { id: 'aff',    label: 'Affiliate leads spike',    tone: 'good' },
                ]}
              />

              {!onChannelScreen && (
                <ChannelTable
                  rows={view.rows}
                  wideColumns={!chatOpen}
                  onRowClick={(k) => { setNav('channels'); setChannel(k); }}
                />
              )}

              <Chart
                channel={scope}
                metric={metric}
                onMetricChange={setMetric}
                data={view.data}
                yTicks={view.ticks}
              />

              {onChannelScreen && <CampaignTable channel={channel} wideColumns={!chatOpen} />}
            </>
          )}

          {nav === 'channels' && !onChannelScreen && (
            <ChannelTable rows={view.rows} wideColumns={!chatOpen}
                          onRowClick={(k) => setChannel(k)} />
          )}

          {nav === 'campaigns' && <CampaignTable wideColumns={!chatOpen} />}

          {(nav === 'reports' || nav === 'notifications' || nav === 'settings') && (
            <div className="gr-placeholder gr-type-body">
              {navTitle(nav)} is not built yet.
            </div>
          )}

          <div className="gr-content__spacer" />
        </main>
      </div>

      {chatOpen && (
        <aside className="gr-chat" aria-label="Team chat">
          <header className="gr-chat__header">
            <div>
              <h2 className="gr-type-section">Team chat</h2>
              <p className="gr-type-caption">#growth-analytics · synced</p>
            </div>
            <button type="button" className="gr-chat__close" onClick={() => setChatOpen(false)} aria-label="Close chat">✕</button>
          </header>
          <div className="gr-chat__messages">
            <p className="gr-type-body">Meta CAC is up 42% week over week. Worth a look before Friday.</p>
            <p className="gr-type-body">Pulled the campaign split — most of it is Advantage+ Shopping.</p>
          </div>
          <div className="gr-chat__composer">
            <input className="gr-chat__input gr-type-body" placeholder="Message #growth-analytics" />
            <Button variant="primary">Send</Button>
          </div>
        </aside>
      )}
    </div>
  );
}

function navTitle(nav: NavKey): string {
  return nav === 'overview' ? 'Overview' : nav[0].toUpperCase() + nav.slice(1);
}
