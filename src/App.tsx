import { useEffect, useMemo, useState, useCallback } from 'react';
import { Sidebar, type NavKey } from './components/Sidebar/Sidebar';
import { Button } from './components/Button/Button';
import { KpiCard } from './components/KpiCard/KpiCard';
import { Chart } from './components/Chart/Chart';
import { InfoStrip } from './components/InfoStrip/InfoStrip';
import { ChannelTable, type ChannelRow } from './components/ChannelTable/ChannelTable';
import { CampaignTable } from './components/CampaignTable/CampaignTable';
import { ThemeToggle } from './components/ThemeToggle/ThemeToggle';
import { ChannelSwitcher } from './components/ChannelSwitcher/ChannelSwitcher';
import { ChannelWordmark } from './components/ChannelWordmark/ChannelWordmark';
import { useChannels } from './data/channels';
import { RangePicker } from './components/RangePicker/RangePicker';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { Assistant } from './components/Assistant/Assistant';
import { downloadCsv } from './data/exportCsv';
import { Reports } from './screens/Reports';
import { Notifications } from './screens/Notifications';
import { Settings } from './screens/Settings';
import {
  CHANNEL_LABEL, activeChannels, delta, formatMetric, isActive, series, sparkline, totals,
  RANGE_LABEL,
  type Metric, type Range, type Scope,
} from './data/metrics';
import type { ChannelName } from './styles/tokens';
import type { ViewRef } from './data/chat';
import { readDeepLink } from './data/chat';

const THEME_KEY = 'growth.theme';

export default function App() {
  /* Remembered, and defaulted from the OS.

     Channels and conversations both persist to localStorage; theme did not, so
     a reload dropped a user back into light mode while everything else they had
     changed survived. Inconsistent durability between neighbouring settings is
     worse than none, because it is unpredictable rather than merely absent.

     Read in the initialiser, not an effect, so the first paint is already
     correct -- an effect would flash light and then switch. */
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* private mode, or storage disabled */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [nav, setNav] = useState<NavKey>('overview');
  const [channel, setChannel] = useState<ChannelName | null>(null);
  const [metric, setMetric] = useState<Metric>('Spend');
  const [chatOpen, setChatOpen] = useState(false);
  const [range, setRange] = useState<Range>(30);
  const [pendingView, setPendingView] = useState<ViewRef | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  const enabled = useChannels();

  /* A shared link, applied once on load.

     Links were being generated and posted to Slack and then IGNORED on
     arrival: clicking one opened the default Overview and dropped the view
     entirely. It looked like it worked because the card renders inside
     Growth's own chat -- that path parses message text, not the URL -- so the
     one case nobody tested was the case the link exists for: a teammate
     clicking it from Slack.

     Read from the initialiser rather than an effect, so the first paint is
     already the linked view. Applying it in an effect would render the
     default dashboard for a frame and then jump. */
  const [deepLink] = useState(() => readDeepLink(window.location.search));

  /* Go to a view. ONE definition, used by the deep link and by clicking a card
     in the chat -- they are the same action arriving from two directions, and
     two copies would drift the moment either grew a case. */
  const applyView = useCallback((v: ViewRef) => {
    setMetric(v.metric);
    setRange(v.range);
    if (v.channel === 'all') { setChannel(null); setNav('overview'); }
    else { setChannel(v.channel as ChannelName); setNav('channels'); }
  }, []);

  useEffect(() => {
    if (!deepLink) return;
    applyView(deepLink.view);
    /* The link points at a conversation, so the conversation is the point.
       Landing on the right chart with the chat closed would strand you one
       click from the thing you followed the link to read. */
    if (deepLink.conversationId) setChatOpen(true);

    /* Clear the query so a refresh does not re-apply it and yank you back to
       the linked view after you have navigated away. */
    window.history.replaceState({}, '', window.location.pathname);
  }, [deepLink, applyView]);

  /* Switching off the channel you are looking at has to move you somewhere
     that still exists. Leaving the page up would show a screen for something
     the account does not run, built from a series nothing else is counting. */
  useEffect(() => {
    if (channel && !isActive(channel)) setChannel(null);
  }, [enabled, channel]);

  // Cmd/Ctrl-K, the shortcut people already try in a product like this.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAssistOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);


  /* The attribute is what CSS reads, so it has to be set for the INITIAL value
     too -- not only on toggle. Restoring dark from storage without this left
     the state saying dark and every token still light. */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* quota */ }
  }, [theme]);

  function toggleTheme() {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }

  const scope: Scope = channel ?? 'all';

  /* Clicking a KPI card stages that metric in the chat composer and opens the
     panel. This is what makes the card clickable — it was a <button> with no
     handler, which is the same dead control as a switch that flips nothing. */
  function shareMetric(m: Metric) {
    setPendingView({ channel: scope, metric: m, range });
    setChatOpen(true);
  }


  /* Everything below is derived from `scope` and `metric`. Changing either one
     recomputes the whole screen — the KPI values, the deltas, the sparklines,
     the chart series and its axis. Before this, the metric toggle changed a
     heading and nothing else, which is the single most common way a portfolio
     prototype gives itself away. */
  const view = useMemo(() => {
    const t = totals(scope, range);
    const data = series(scope, metric, range);
    return {
      totals: t,
      data,
      rows: activeChannels().map<ChannelRow>((key) => {
        const ct = totals(key, range);
        return {
          key,
          name: CHANNEL_LABEL[key],
          spend: ct.spend,
          leads: ct.leads,
          cac: ct.cac,
          roas: ct.roas,
          delta: delta(key, metric, range),
          trend: sparkline(key, metric, range),
        };
      }),
    };
    /* `enabled` is not read in this body, but it MUST be a dependency.

       totals() and activeChannels() read the channel set from module state,
       which useChannels() mutates -- so the value this memo returns depends on
       something React cannot see. Without it, toggling a channel off in
       Settings left Overview showing the cached six-channel object: total spend
       computed on 6 while the delta badge beside it recomputed on 5, a table
       row for a channel Settings said was removed, and an Export that wrote 5
       channels next to a table showing 6. Nothing recovered it but a reload or
       a range change. */
  }, [scope, metric, range, enabled]);

  const onChannelScreen = channel !== null;
  const title = onChannelScreen ? CHANNEL_LABEL[channel] : navTitle(nav);
  const SUBTITLES: Record<string, string> = {
    reports: 'Scheduled exports sent to your team',
    notifications: 'Alerts from the last two days',
    settings: 'Connections, alerts and appearance',
  };
  const sub = onChannelScreen
    ? `${formatMetric('Spend', view.totals.spend)} spend · ${RANGE_LABEL[range].toLowerCase()}`
    : (SUBTITLES[nav] ?? `All channels · ${RANGE_LABEL[range].toLowerCase()}`);

  const showDashboard = nav === 'overview' || (nav === 'channels' && onChannelScreen);

  return (
    <div className="gr-app">
      <Sidebar active={nav} onNavigate={(k) => { setNav(k); setChannel(null); }} />

      <div className={`gr-main ${chatOpen ? 'is-chat-open' : ''}`}>
        <header className="gr-header">
          {/* The crumb row is always present, empty on screens without one.
              Rendering it conditionally made the header a different height on
              channel screens, so the whole page shifted on drill-in.

              It sits ABOVE the toolbar, not inside the title column. Nested, it
              added 18px of invisible space to the title block, and the toolbar
              centred the buttons on that — so they floated above the visible
              text with a gap under them. A spacer should reserve height for the
              row it belongs to, not silently reposition its neighbours. */}
          <div className="gr-crumb-slot">
            {onChannelScreen && (
              <button type="button" className="gr-crumb gr-type-caption" onClick={() => setChannel(null)}>
                {/* Parent only. It read "Channels › Meta" directly above an
                    <h1> reading "Meta" — the same word twice, two lines apart.
                    A breadcrumb's job is the way back, and the title already
                    says where you are. */}
                <span aria-hidden="true">‹</span> Channels
              </button>
            )}
          </div>
          <div className="gr-toolbar">
            <div className="gr-toolbar__title">
              <h1 className="gr-type-page-title">
                {/* On a channel screen the title is the channel's own logo,
                    matching the design — where each brand lockup appears
                    exactly once, in this slot. Channels without a logo keep
                    the text. */}
                {onChannelScreen && channel
                  ? <ChannelWordmark channel={channel} name={title} />
                  : title}
              </h1>
              <p className="gr-type-caption">{sub}</p>
            </div>
            <div className="gr-toolbar__spacer" />
            {/* Two groups, not six loose controls. As flat siblings they wrapped
                one at a time wherever the row ran out of room, which orphaned
                Export onto a line by itself. Filters and actions are separate
                ideas, so they wrap as units. */}
            <div className="gr-toolbar__group">
              <ChannelSwitcher
                value={channel}
                onChange={(next) => {
                  setChannel(next);
                  if (next) setNav('channels');
                }}
              />
              <RangePicker value={range} onChange={setRange} />
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
            <div className="gr-toolbar__group">
              <Button variant="ghost" onClick={() => setAssistOpen(true)}>Ask</Button>
              <Button variant="ghost" onClick={() => setChatOpen(!chatOpen)}>Chat</Button>
              <Button variant="primary" onClick={() => downloadCsv(scope, range)}>Export</Button>
            </div>
          </div>
        </header>

        <main className="gr-content">
          {showDashboard && (
            <>
              <div className="gr-kpi-row">
                <KpiCard onDiscuss={() => shareMetric('Spend')} label="Total spend"
                         value={formatMetric('Spend', view.totals.spend)}
                         deltaPercent={delta(scope, 'Spend', range)}
                         sparkline={sparkline(scope, 'Spend', range)}
                         metric="Spend" channel={scope} />
                <KpiCard onDiscuss={() => shareMetric('Leads')} label="Total leads"
                         value={formatMetric('Leads', view.totals.leads)}
                         deltaPercent={delta(scope, 'Leads', range)}
                         sparkline={sparkline(scope, 'Leads', range)}
                         metric="Leads" channel={scope} />
                <KpiCard onDiscuss={() => shareMetric('CAC')} higherIsBetter={false}
                         label={onChannelScreen ? 'CAC' : 'Blended CAC'}
                         value={formatMetric('CAC', view.totals.cac)}
                         deltaPercent={delta(scope, 'CAC', range)}
                         sparkline={sparkline(scope, 'CAC', range)}
                         metric="CAC" channel={scope} />
                <KpiCard onDiscuss={() => shareMetric('ROAS')} label={onChannelScreen ? 'ROAS' : 'Blended ROAS'}
                         value={formatMetric('ROAS', view.totals.roas)}
                         deltaPercent={delta(scope, 'ROAS', range)}
                         sparkline={sparkline(scope, 'ROAS', range)}
                         metric="ROAS" channel={scope} />
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
                  metric={metric}
                  wideColumns={!chatOpen}
                  onRowClick={(k) => { setNav('channels'); setChannel(k); }}
                />
              )}

              <Chart
                channel={scope}
                metric={metric}
                onMetricChange={setMetric}
                data={view.data}
              />

              {onChannelScreen && <CampaignTable channel={channel} wideColumns={!chatOpen} />}
            </>
          )}

          {nav === 'channels' && !onChannelScreen && (
            <ChannelTable rows={view.rows} metric={metric} wideColumns={!chatOpen}
                          onRowClick={(k) => setChannel(k)} />
          )}

          {nav === 'campaigns' && <CampaignTable wideColumns={!chatOpen} />}

          {nav === 'reports' && <Reports />}
          {nav === 'notifications' && <Notifications />}
          {nav === 'settings' && (
            <Settings
              theme={theme}
              onThemeChange={(next) => {
                setTheme(next);
                document.documentElement.dataset.theme = next;
              }}
            />
          )}

          <div className="gr-content__spacer" />
        </main>
      </div>

      <Assistant open={assistOpen} onClose={() => setAssistOpen(false)} range={range} />

      {chatOpen && (
        <ChatPanel
          onClose={() => setChatOpen(false)}
          pending={pendingView}
          onClearPending={() => setPendingView(null)}
          initialConversationId={deepLink?.conversationId ?? null}
          onOpenView={applyView}
        />
      )}
    </div>
  );
}

function navTitle(nav: NavKey): string {
  return nav === 'overview' ? 'Overview' : nav[0].toUpperCase() + nav.slice(1);
}
