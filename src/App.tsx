import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Sidebar, type NavKey } from './components/Sidebar/Sidebar';
import { BottomNav } from './components/BottomNav/BottomNav';
import { Button } from './components/Button/Button';
import { KpiCard } from './components/KpiCard/KpiCard';
import { Chart } from './components/Chart/Chart';
import { InfoStrip } from './components/InfoStrip/InfoStrip';
import { ChannelTable, type ChannelRow } from './components/ChannelTable/ChannelTable';
import { CampaignTable } from './components/CampaignTable/CampaignTable';
import { CampaignPreview } from './components/CampaignPreview/CampaignPreview';
import { ChannelSwitcher } from './components/ChannelSwitcher/ChannelSwitcher';
import { ChannelWordmark } from './components/ChannelWordmark/ChannelWordmark';
import { useChannels } from './data/channels';
import { notifications, type NoteKind } from './data/notifications';
import { setDemoState, useDemoState } from './data/demoState';
import { useDataSource } from './data/useDataSource';
import { seededSource } from './data/sources/seeded';
import { metaSource } from './data/sources/meta';
import { googleSource } from './data/sources/google';
import { RangePicker } from './components/RangePicker/RangePicker';
import { ChatPanel } from './components/ChatPanel/ChatPanel';
import { Assistant } from './components/Assistant/Assistant';
import { downloadCsv } from './data/exportCsv';
import { Reports } from './screens/Reports';
import { Ads } from './screens/Ads';
import { Decisions } from './screens/Decisions';
import { Notifications } from './screens/Notifications';
import { Settings } from './screens/Settings';
import { CampaignDetail } from './screens/CampaignDetail';
import { AdDetail } from './screens/AdDetail';
import { AdSetDetail } from './screens/AdSetDetail';
import { CAMPAIGNS } from './data/campaigns';
import { useMonthlyBudget } from './data/profile';
import {
  CHANNEL_LABEL, activeChannels, dataVersion, delta, endBackFor, isoForEndBack, setWindowEnd, formatMetric, isActive, series, sparkline, totals,
  rangePhrase, METRICS, chartMetricsFor, plottable,
  type Metric, type Range, type Scope,
} from './data/metrics';
import { campaignById } from './data/campaignSeries';
import { adSetById } from './data/adSets';
import { decisions, targetOfDecision, type Target } from './data/decisions';
import { creativeById } from './data/creative';
import {
  CHANNEL_METRICS, betterHigher, formatDerived, headlineKpis, trendMark,
  type DerivedMetric,
} from './data/channelMetrics';
import {
  blendedDelta, blendedMetrics, blendedSparkline, blendedTotal, channelChange, coverageNote, coverageTitle,
} from './data/blended';
import {
  dismissAlert, dismissAll, markAllRead, setPref, undismissAlert, usePrefs,
} from './data/prefs';
import { useNavCounts } from './data/navCounts';
import { onAttentionStrip, removeFlag, restoreFlag, useFlags, type Flag } from './data/attention';
import { readUrlState, writeUrlState } from './data/urlState';
import type { ChannelName } from './styles/tokens';
import type { DecisionRef, ReportRef, ViewRef } from './data/chat';
import { MEMBERS, readDeepLink } from './data/chat';

/* The alerts, with the view each one points at.
   Kept beside the labels so a pill can never name one channel and navigate to
   another -- the label and the destination are one object. */
/* The Overview strip's pills are the "This week" and pacing NOTIFICATIONS --
   the same objects, from `notifications()`, not a second hand-typed list. It
   used to be a separate array whose "Meta CAC ↑ 42% WoW" the data did not
   support; now both screens say what the rows say, or neither says it.

   `kind` is what the Settings switches address, and the id is shared with the
   feed so dealing with a pill here marks its row read there. */
const STRIP_KINDS: NoteKind[] = ['cac', 'leads', 'pacing'];

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
  /* Seeded from the URL in the initialiser, not an effect -- an effect would
     paint Overview first and then jump, which reads as a bug even when it
     lands in the right place. */
  const initialUrl = useState(() => readUrlState(window.location.search))[0];
  const [nav, setNav] = useState<NavKey>(initialUrl.nav ?? 'overview');
  const [channel, setChannel] = useState<ChannelName | null>(initialUrl.channel ?? null);
  const [metric, setMetric] = useState<Metric>(initialUrl.metric ?? 'Spend');
  const [chatOpen, setChatOpen] = useState(false);
  const [range, setRange] = useState<Range>(initialUrl.range ?? 30);
  /* Custom dates: the window's END DATE. Kept as a date, not "N days back", and
     resolved against the account loaded NOW -- every render, before anything
     reads the data (idempotent: the data layer only changes if the answer
     does). A date the account does not have, or a window reaching before its
     data, falls back to "Last N days" instead of an empty app. */
  const [toIso, setToIso] = useState<string | null>(initialUrl.to ?? null);
  const endBack = endBackFor(toIso, range) ?? 0;
  setWindowEnd(endBack);
  /** One way to change the window: length and where it ends, together. */
  const setWindow = useCallback((r: Range, e = 0) => {
    setWindowEnd(e);
    setToIso(isoForEndBack(e));
    setRange(r);
  }, []);
  /* What the Channels screen's change column measures. Its own state, not the
     app-wide metric: that one drives the Overview chart and is limited to six
     funnel metrics; this column can show any of eleven. CAC by default --
     "is anything getting more expensive" is the question this table answers. */
  const [tableMetric, setTableMetric] = useState<DerivedMetric>('CAC');
  const [pendingView, setPendingView] = useState<ViewRef | null>(null);
  /* A decision staged in team chat by "Share" -- the same pattern as a view
     staged by "Discuss": chat opens, you pick the conversation, you send. */
  const [pendingDecision, setPendingDecision] = useState<DecisionRef | null>(null);
  const [pendingReport, setPendingReport] = useState<ReportRef | null>(null);
  const [assistOpen, setAssistOpen] = useState(false);
  /* A question staged for the assistant by another screen. Cleared once asked. */
  const [assistSeed, setAssistSeed] = useState<string | null>(null);
  /* ONE way to raise a subject with the agent, used by every surface that can.
     Six call sites each opening the panel their own way is how one of them ends
     up not clearing the seed, or not opening at all. */
  const [assistSubject, setAssistSubject] = useState<Target | null>(null);
  const askAbout = useCallback((question: string, subject?: Target) => {
    setAssistSeed(question);
    setAssistSubject(subject ?? null);
    setAssistOpen(true);
  }, []);
  const enabled = useChannels();
  /* The sidebar's counts -- the same numbers the Decisions and Notifications
     screens show. */
  const navCounts = useNavCounts(range, enabled);
  /* Drives the loading/error/empty states, which are otherwise unreachable —
     the data layer is synchronous, so nothing here can be slow or fail. */
  const simulated = useDemoState();
  /* ⭐ Phase 3: the data comes from a SOURCE, loaded with real request state.
     The Settings simulator still overrides it, so the states can be looked at
     on the demo account -- but it is now the second way in, not the only one. */
  const { dataSource } = usePrefs();
  const source = useDataSource(dataSource === 'meta' ? metaSource : dataSource === 'google' ? googleSource : seededSource);
  const demo = simulated !== 'ready' ? simulated : source.status;

  /* Which campaign's page is open, if any. Null means the Campaigns list.
     Held here rather than inside CampaignTable because App owns navigation and
     the table is unmounted whenever nav changes. */
  const [campaignId, setCampaignId] = useState<string | null>(initialUrl.campaign ?? null);
  /* The channel a campaign was opened FROM, so Back returns there instead of
     dumping you in the unfiltered campaign list you never visited. Not stored
     in the URL -- it describes how you arrived, not where you are, and after a
     reload the honest answer is that we do not know. */
  const [cameFrom, setCameFrom] = useState<ChannelName | null>(null);
  /* The ad set being inspected. A third level of nesting, between the campaign
     and the ad -- and the tier a media buyer actually works in, so it needed a
     place in navigation rather than being a row you could only read. */
  const [adSetId, setAdSetId] = useState<string | null>(initialUrl.adSet ?? null);
  /* The ad being inspected. Nested under a campaign, so opening one does not
     clear campaignId -- Back has to land on the campaign, not the list. */
  const [adId, setAdId] = useState<string | null>(initialUrl.ad ?? null);

  const budget = useMonthlyBudget();
  const { cacAlerts, pacing, dismissedAlerts } = usePrefs();
  const attentionFlags = useFlags();

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
  /* 🐛 The app's OWN urls carry c/m/r too (urlState writes them), so every
     reload of Settings, Decisions, an ad page... was read as a Slack link and
     sent to Overview. A Slack share link never has `v`; the app's own url
     always does. */
  const [deepLink] = useState(() => (
    new URLSearchParams(window.location.search).has('v') ? null : readDeepLink(window.location.search)
  ));

  /* Go to a view. ONE definition, used by the deep link and by clicking a card
     in the chat -- they are the same action arriving from two directions, and
     two copies would drift the moment either grew a case. */
  /* One definition of "open this campaign", used by the channel screen, the
     campaign list and a shared chat card alike.

     The channel screen's table was rendered WITHOUT a handler, so campaign
     names there were plain text while the identical table one nav item away
     had them as links. Same component, same rows, two behaviours -- decided by
     which call site remembered to pass the prop. */
  const openCampaign = useCallback((id: string, from: ChannelName | null = null) => {
    setCameFrom(from);
    setAdId(null);
    setAdSetId(null);
    setCampaignId(id);
    /* 🐛 Left set, the header kept the channel's logo and a "‹ Channels" crumb
       that only changed the title. closeCampaign restores it from cameFrom. */
    setChannel(null);
    setNav('campaigns');
  }, []);

  const closeCampaign = useCallback(() => {
    setCampaignId(null);
    /* Both deeper tiers clear with it. Leaving either set would route straight
       back into the page you just closed -- the render checks the deepest id
       first, so a stale one wins over the campaign you asked for. */
    setAdSetId(null);
    setAdId(null);
    if (cameFrom) { setChannel(cameFrom); setNav('channels'); setCameFrom(null); }
  }, [cameFrom]);

  /* ⭐ ONE definition of "go to the thing a decision is about", used by every
     decision card and by the overdue pill on Overview. Each tier lands on its
     own page with the chain above it set, so Back walks up normally: an ad
     opens inside its ad set inside its campaign. */
  const openTarget = useCallback((t: Target) => {
    setCameFrom(null);
    if (t.kind === 'campaign') { openCampaign(t.id); return; }
    if (t.kind === 'adSet') {
      const ref = adSetById(t.id);
      if (!ref) return;
      setCampaignId(ref.campaign.id); setAdSetId(t.id); setAdId(null);
      setNav('campaigns');
      return;
    }
    if (t.kind === 'ad') {
      const owner = creativeById(t.id);
      if (!owner) return;
      setCampaignId(owner.campaignId); setAdSetId(owner.creative.adSetId); setAdId(t.id);
      setNav('campaigns');
      return;
    }
    setCampaignId(null); setAdSetId(null); setAdId(null);
    if (t.kind === 'channel') { setChannel(t.id as ChannelName); setNav('channels'); }
    else { setChannel(null); setNav('overview'); }
  }, [openCampaign]);

  const applyView = useCallback((v: ViewRef, keepEnd = 0) => {
    /* A shared view is "last N days" -- it carries no custom dates. An alert
       opened from the strip passes the window's end, so it shows its own week. */
    setWindow(v.range, keepEnd);

    /* A ViewRef's metric is a DerivedMetric, which is wider than what the
       app-wide toggle accepts -- a campaign can share CTR or CPM. Narrow
       before setting, and leave the current metric alone when it does not
       fit rather than coercing it into a different measurement. */
    if ((METRICS as string[]).includes(v.metric)) setMetric(v.metric as Metric);

    /* A shared campaign card opens the campaign, not its channel. Opening the
       channel would land you on a screen that does not contain the number you
       followed the link to read. */
    if (v.campaign) {
      setCameFrom(null);
      setAdId(null);
      setAdSetId(null);
      setCampaignId(v.campaign);
      setNav('campaigns');
      return;
    }

    setCampaignId(null);
    setAdSetId(null);
    setAdId(null);
    if (v.channel === 'all') { setChannel(null); setNav('overview'); }
    else { setChannel(v.channel as ChannelName); setNav('channels'); }
  }, [setWindow]);

  /* Write the URL back whenever the screen changes.

     Navigation pushes; filters replace. Drilling into a campaign or switching
     screen is somewhere you can meaningfully go BACK from -- nudging the metric
     toggle is not, and pushing an entry per filter change turns the back button
     into a slow undo of things nobody wanted undone.

     The ref holds the PREVIOUS nav identity rather than comparing against
     current state, because by the time this effect runs the state has already
     changed and there is nothing left to compare to. */
  const lastPlace = useRef<string | null>(null);
  useEffect(() => {
    const place = `${nav}|${channel ?? 'all'}|${campaignId ?? ''}|${adSetId ?? ''}|${adId ?? ''}`;
    const isNavigation = lastPlace.current !== null && lastPlace.current !== place;
    lastPlace.current = place;
    writeUrlState({ nav, channel, metric, range, to: endBack ? toIso : null, campaign: campaignId, adSet: adSetId, ad: adId },
                  isNavigation ? 'push' : 'replace');
  }, [nav, channel, metric, range, endBack, toIso, campaignId, adSetId, adId]);

  /* The back button. Without this, history entries existed and pressing back
     changed the URL while the screen stayed exactly where it was -- which is
     worse than having no history at all, because the address bar then lies
     about what is on screen. */
  useEffect(() => {
    function onPop() {
      const u = readUrlState(window.location.search);
      setNav(u.nav ?? 'overview');
      setChannel(u.channel ?? null);
      setMetric(u.metric ?? 'Spend');
      setRange(u.range ?? 30);
      setToIso(u.to ?? null);
      setCampaignId(u.campaign ?? null);
      setAdSetId(u.adSet ?? null);
      setAdId(u.ad ?? null);
      /* Keeps the writer from pushing a fresh entry for a move the user made
         by going back -- that would make forward unreachable. */
      lastPlace.current = `${u.nav ?? 'overview'}|${u.channel ?? 'all'}|${u.campaign ?? ''}|${u.adSet ?? ''}|${u.ad ?? ''}`;
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setWindow]);

  useEffect(() => {
    if (!deepLink) return;
    applyView(deepLink.view);
    /* The link points at a conversation, so the conversation is the point.
       Landing on the right chart with the chat closed would strand you one
       click from the thing you followed the link to read. */
    if (deepLink.conversationId) setChatOpen(true);

    /* The query is NOT wiped here any more. It used to be, so that a refresh
       would not yank you back to a linked view -- but the URL now tracks where
       you actually are, so a refresh landing you back where you were is the
       feature rather than the bug. `t` drops off on the first write because
       urlStateQuery never emits it. */
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


  const scope: Scope = channel ?? 'all';
  /* What the chart can plot here. The PICK is kept: Clicks on Overview, then
     Podcasts (shows Leads), then back to Overview shows Clicks again. */
  const chartMetrics = chartMetricsFor(scope);
  const shown = plottable(scope, metric);

  /* Clicking a KPI card stages that metric in the chat composer and opens the
     panel. This is what makes the card clickable — it was a <button> with no
     handler, which is the same dead control as a switch that flips nothing. */
  /* Widened from Metric to DerivedMetric when the KPI row stopped being four
     hardcoded cards. An Overview card can now be CTR or Impressions, and sharing
     one as "Spend" would put a number in the thread that is not the one the
     sender clicked -- the same failure the campaign cards already fixed. */
  function shareMetric(m: DerivedMetric) {
    setPendingView({ channel: scope, metric: m, range });
    setChatOpen(true);
  }

  /* The campaign equivalent. The channel still travels with it -- the card's
     mark, colour and benchmark all come from the channel, and a campaign that
     arrived in a thread without one would be a name and a number with no way
     to tell what it was even bought on. */
  function shareCampaign(id: string, m: DerivedMetric) {
    const c = campaignById(id);
    if (!c) return;
    setPendingView({ channel: c.channel, metric: m, range, campaign: id });
    setChatOpen(true);
  }


  /* Everything below is derived from `scope` and `metric`. Changing either one
     recomputes the whole screen — the KPI values, the deltas, the sparklines,
     the chart series and its axis. Before this, the metric toggle changed a
     heading and nothing else, which is the single most common way a portfolio
     prototype gives itself away. */
  /* Which load of the data this render sees. The memos below read module
     state (the rows hydrate() installs), so they must also key on WHEN it was
     installed -- otherwise an account that loads with the same channel list as
     the one before would keep showing the previous account's totals. */
  const version = dataVersion();
  const view = useMemo(() => {
    const t = totals(scope, range);
    const data = series(scope, shown, range);
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
          delta: delta(key, shown, range),
          /* Always ROAS -- the one trend that means the same thing on every
             visit, whatever the change column is set to. */
          trend: sparkline(key, 'ROAS', range),
          sub: (() => {
            const n = CAMPAIGNS.filter((c) => c.channel === key).length;
            return `${n} campaign${n === 1 ? '' : 's'}`;
          })(),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enabled/version are the cache keys explained above
  }, [scope, shown, range, enabled, version]);

  /* The channels a KPI card is computed over: one on a channel screen, every
     active one on Overview. Deriving the list here rather than inside the row
     keeps the two screens on one code path. */
  const kpiScope = useMemo(
    () => (channel ? [channel] : activeChannels()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- module state; enabled/version say when it changed
    [channel, enabled, version],
  );
  /* What a channel can report, or what the blend can. `headlineKpis` filters a
     fixed funnel order by availability, so Paid Search drops Impressions and
     podcasts drop Clicks without either needing a special case. */
  const kpiMetrics = useMemo(
    () => headlineKpis(channel ? CHANNEL_METRICS[channel] : blendedMetrics(kpiScope)),
    [channel, kpiScope],
  );

  /* Spend against the budget planned for this many days. Declared after `view`
     because it reads from it -- placing it above the memo is a temporal dead
     zone error, not a style preference.

     Clamped only for the BAR. The percentage still reads over 100 when
     overspent, because hiding an overspend is the one thing a pacing number
     must never do. */
  const pace = budget > 0 ? view.totals.spend / ((budget / 30) * range) : 0;

  /* The two Settings switches, honoured. Turning "CAC threshold alerts" off in
     Settings and finding the CAC alert still on Overview would have made the
     switch a decoration -- which is what it was. */
  /* DERIVED: raised by the data, gated by the Settings switches, minus
     anything already dealt with. */
  const notes = notifications(enabled);
  const derivedAlerts = notes
    .filter((n) => STRIP_KINDS.includes(n.kind))
    .filter((n) => (n.kind === 'cac' ? cacAlerts : n.kind === 'pacing' ? pacing : true)
      && !dismissedAlerts.includes(n.id))
    .map((n) => ({ id: n.id, label: n.short, tone: n.tone, note: n }));

  /* ASSIGNED: put there by a person. Not gated by the alert switches -- those
     control which THINGS THE DATA NOTICES get surfaced, and silencing pacing
     warnings should never silence something Tommy flagged by hand. */
  /* ⚠️ DECISIONS ARE NOT ATTENTION, and this strip is worse for holding them.
   *
   * "Needs attention" answers "what should I look at" — things that surfaced and
   * are unresolved. "Your queue" answers "what did I commit to". A decision you
   * have already taken is by definition no longer needing attention: attending
   * to it is exactly what taking it meant.
   *
   * Six items in the strip, four of them already dealt with, burying the two
   * that were not — the Meta CAC jump and the TikTok pacing gap. A list whose
   * job is to be short and entirely undealt-with stops working the moment it
   * holds resolved things, because the reader has to sort it themselves.
   *
   * ⚠️ Assigned flags STAY. "You flagged this Tuesday" is an open loop with no
   * conclusion attached; "you decided to pause this ad" is a closed one. G-001
   * separated those two kinds for this reason and the distinction still holds.
   *
   * ✅ The case that brings one back: a decision past its due date. An overdue
   * commitment genuinely does need attention again. The rule lives in
   * `onAttentionStrip`, read here AND by Clear all, so the two cannot drift.
   */
  const assignedAlerts = attentionFlags
    .filter((f) => onAttentionStrip(f))
    .map((f) => (f.kind === 'decision'
      /* ✅ G-008 wired it. Only reachable because dates now exist. Red, named,
         and without a × -- see Alert.dismissable. */
      ? {
          id: `flag:${f.id}`,
          label: `Overdue${f.owner && MEMBERS[f.owner] ? ` · ${MEMBERS[f.owner].name.split(' ')[0]}` : ''}: ${f.label}`,
          tone: 'bad' as const,
          source: 'overdue' as const,
          dismissable: false,
        }
      : {
          id: `flag:${f.id}`,
          label: f.label,
          tone: 'warn' as const,
          source: 'assigned' as const,
        }));

  const shownAlerts = [
    ...assignedAlerts,
    ...derivedAlerts.map((a) => ({ ...a, source: 'derived' as const })),
  ];

  /* What an undo would put back. Held in state rather than derived, because
     after the action there is nothing left on screen to derive it from. */
  const [lastCleared, setLastCleared] = useState<
    { kind: 'derived'; id: string; label: string } |
    { kind: 'assigned'; flag: Flag } | null>(null);

  /* Addressing an alert also marks the notification describing the same event
     as read, so the two screens cannot disagree about whether it is still
     outstanding. */
  function addressAlert(id: string) {
    /* An assigned flag is removed outright; a derived one is dismissed. Same
       gesture, two different underlying facts -- you cannot "dismiss" something
       a person put there, you take it off the list. */
    if (id.startsWith('flag:')) {
      const flag = attentionFlags.find((f) => `flag:${f.id}` === id);
      if (!flag) return;
      setLastCleared({ kind: 'assigned', flag });
      removeFlag(flag.kind, flag.refId);
      return;
    }
    const a = derivedAlerts.find((x) => x.id === id);
    if (!a) return;
    setLastCleared({ kind: 'derived', id: a.id, label: a.label });
    markAllRead([a.id]);
    dismissAlert(id);
  }

  function undoLastClear() {
    if (!lastCleared) return;
    if (lastCleared.kind === 'assigned') restoreFlag(lastCleared.flag);
    else undismissAlert(lastCleared.id);
    setLastCleared(null);
  }

  const onChannelScreen = channel !== null;
  const title = onChannelScreen ? CHANNEL_LABEL[channel] : navTitle(nav);
  const SUBTITLES: Record<string, string> = {
    reports: 'Scheduled exports sent to your team',
    notifications: 'What your numbers — and your decisions — did this week',
    settings: 'Connections, alerts and appearance',
  };
  const sub = onChannelScreen
    ? `${formatMetric('Spend', view.totals.spend)} spend · ${rangePhrase(range)}`
    : (SUBTITLES[nav] ?? `All channels · ${rangePhrase(range)}`);

  const showDashboard = nav === 'overview' || (nav === 'channels' && onChannelScreen);

  /* Going to a screen clears every tier below it -- one function, because the
     sidebar and the phone's tab bar both navigate (see the Sidebar comment). */
  const navigateTo = (k: NavKey) => {
    setNav(k); setChannel(null); setCampaignId(null); setAdSetId(null); setAdId(null);
  };

  return (
    <div className="gr-app">
      {/* Skip link. The first Tab stop on every screen; invisible until focused.
          Without it a keyboard user tabs through 8 nav items, the account
          button and 6 header controls -- 15 stops -- before the first number on
          any page, every time they change screen. */}
      <a href="#main" className="gr-skip gr-type-label-button"
         onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      {/* Clearing campaignId here is what makes the Campaigns nav item work
          while a campaign page is open. Without it, clicking Campaigns from a
          detail page sets nav to the value it already has and nothing moves --
          a nav item that appears dead.

          ⚠️ It cleared ONLY campaignId, which meant the dead-nav bug it was
          written to fix still happened one level deeper: from an ad page,
          clicking Campaigns cleared the campaign and left `adId` set, and the
          render checks `adId` first -- so you stayed on the ad, now with no
          campaign behind it and a breadcrumb reading "Campaign". Every tier has
          to clear, not just the first one that was noticed. */}
      <Sidebar active={nav} counts={navCounts} onNavigate={navigateTo} />

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
              <RangePicker value={range} onChange={(r, e) => setWindow(r, e ?? 0)} />
            </div>
            {/* ⭐ Sept 30 (Tommy: "is this the proper order? should this all be here?")
                - The theme toggle left: a set-once preference, already in
                  Settings, and it sat inside the FILTER group.
                - Ask AI is the primary: purple is the loudest thing on screen
                  and it was on Export, the least-used action. The AI telling you
                  what to do is what the product is for.
                - "Ask" / "Chat" both read as "talk to something": now Ask AI
                  (the assistant's own mark) and Team (the people).
                - Primary at the far right, where the eye ends. */}
            <div className="gr-toolbar__group gr-toolbar__group--actions">
              {/* On a phone these two move into the tab bar's More sheet. */}
              <Button variant="ghost" className="gr-wide-only" icon={<IconDownload />} onClick={() => downloadCsv(scope, range)}>Export</Button>
              <Button variant="ghost" className="gr-wide-only" onClick={() => setChatOpen(!chatOpen)}>Team</Button>
              <Button variant="primary" icon={<IconAsk />} onClick={() => setAssistOpen(true)}>Ask AI</Button>
            </div>
          </div>
        </header>

        {/* tabIndex -1: focusable by the skip link, not a Tab stop of its own. */}
        <main className="gr-content" id="main" tabIndex={-1}>
          {/* A real source that failed: the reason, and the way back. */}
          {source.status === 'error' && (
            <div className="gr-source-banner" role="alert">
              <p className="gr-type-body">
                <strong>Couldn&rsquo;t load your {dataSource === 'google' ? 'Google Ads' : 'Meta'} data.</strong> {source.error}
              </p>
              <Button variant="ghost" onClick={() => setPref('dataSource', 'seeded')}>Use the demo account</Button>
            </div>
          )}
          {showDashboard && (
            <>
              <div className="gr-kpi-row">
                {/* ⭐ Driven by what the scope can report, not four hardcoded
                    cards.

                    Overview and the channel screens SHARED a row of exactly
                    four -- Spend, Leads, CAC, ROAS -- while a campaign page
                    showed up to nine and an ad page the same. The vocabulary got
                    RICHER the deeper you drilled, which is backwards for a
                    screen whose entire job is "all the channel traffic".

                    One code path serves both, because a channel screen is just a
                    blend of one channel: `blendedTotal(m, [channel])` scopes to
                    that channel and `coverageNote` returns null, so no caveat is
                    printed where none is needed. */}
                {kpiMetrics.map((m) => (
                  <KpiCard
                    key={m}
                    loading={demo === 'loading'}
                    error={demo === 'error'}
                    onDiscuss={() => shareMetric(m)}
                    /* The subject is the metric AND the scope -- "Blended CTR"
                       on Overview and "CTR" on a channel screen are different
                       questions, and the label already encodes which. */
                    onAsk={() => askAbout(
                      `What's going on with ${kpiLabel(m, onChannelScreen)}${
                        onChannelScreen && channel ? ` on ${CHANNEL_LABEL[channel]}` : ''}?`)}
                    label={kpiLabel(m, onChannelScreen)}
                    value={formatDerived(m, blendedTotal(m, kpiScope, range))}
                    higherIsBetter={betterHigher(m)}
                    deltaPercent={blendedDelta(m, kpiScope, range)}
                    sparkline={blendedSparkline(m, kpiScope, range)}
                    sparklineMark={trendMark(m)}
                    /* Names what the figure is computed over when it cannot
                       cover every active channel -- "3 of 6 channels" for a
                       blended CTR, because podcasts have no click and
                       affiliates report no impressions. Null on a complete
                       blend, and on any single channel. */
                    basis={coverageNote(m, kpiScope) ?? undefined}
                    basisTitle={coverageTitle(m, kpiScope)}
                    channel={scope}
                  />
                ))}
                {/* Derived, not typed. Was a hardcoded "64%" that stayed 64%
                    with every channel switched off and $0 beside it. */}
                <KpiCard label="Pace to target"
                         value={`${Math.round(pace * 100)}%`}
                         progress={Math.min(pace, 1)}
                         loading={demo === 'loading'} error={demo === 'error'} />
              </div>

              {/* Each pill names a channel and a metric, so clicking it goes
                  there. They were focusable, pointer-cursored buttons with no
                  handler at all -- the first thing a visitor tries, above the
                  fold, doing nothing. Reuses applyView, the same function the
                  Slack deep link uses, so there is one definition of "go to
                  this view". */}
              {/* Rendered only when something actually needs attention. A bar
                  headed "Needs attention 0" is itself a thing demanding
                  attention. */}
              {(shownAlerts.length > 0 || lastCleared) && (
              <InfoStrip
                alerts={shownAlerts}
                onDismiss={addressAlert}
                onUndo={undoLastClear}
                undoLabel={lastCleared
                  ? (lastCleared.kind === 'assigned' ? lastCleared.flag.label : lastCleared.label)
                  : null}
                onDismissAll={() => {
                  markAllRead(derivedAlerts.map((a) => a.id));
                  dismissAll(derivedAlerts.map((a) => a.id));
                  /* 🐛 Only what the strip actually SHOWS. This cleared every
                     flag in the store, so once decisions stopped appearing here,
                     "Clear all" would have silently wiped the decision queue —
                     a control acting on things outside its own visible scope,
                     with no undo and nothing on screen admitting it happened.

                     The filter has to match the one that built `assignedAlerts`
                     or the two drift, which is how this bug would come back. */
                  /* ...and of those, only the ones with a ×. Clear all is the
                     × on every pill at once; it cannot do what no single pill
                     is allowed to, which is delete an overdue decision. */
                  attentionFlags
                    .filter((f) => onAttentionStrip(f) && f.kind !== 'decision')
                    .forEach((f) => removeFlag(f.kind, f.refId));
                  setLastCleared(null);   // one undo, not a stack
                }}
                onAlertClick={(id) => {
                  /* An overdue decision goes back to the ITEM it was decided
                     on -- the same place its card's "Go to" button goes. With
                     no recoverable target, the queue is the next best place. */
                  const late = attentionFlags.find((f) => f.kind === 'decision' && `flag:${f.id}` === id);
                  if (late) {
                    const t = targetOfDecision(late, decisions(range, enabled));
                    if (t) openTarget(t); else setNav('decisions');
                    return;
                  }
                  const n = derivedAlerts.find((x) => x.id === id)?.note;
                  /* At 7 days: every pill is a week-over-week claim, and the
                     30-day view of the same channel shows a different number. */
                  if (n) applyView({ channel: n.channel ?? 'all', metric: n.metric ?? 'Spend', range: 7 }, endBack);
                }}
              />
              )}

              {!onChannelScreen && (
                <ChannelTable
                  rows={view.rows}
                  metric={shown}
                  range={range}
                  total={{ delta: delta('all', shown, range), trend: sparkline('all', 'ROAS', range) }}
                  wideColumns={!chatOpen}
                  onRowClick={(k) => { setNav('channels'); setChannel(k); }}
                />
              )}

              <Chart
                channel={scope}
                metric={shown}
                metrics={chartMetrics}
                onMetricChange={setMetric}
                data={view.data}
                compareSeries={(m) => series(scope, m, range)}
                periodSeries={(m, sh) => series(scope, m, range, sh)}
                state={demo}
                onRetry={() => setDemoState('ready')}
              />

              {onChannelScreen && (
                <>
                  {/* What is actually running, before the table of everything.
                      A row is a name and six figures; a card has the creative
                      on it, which is what the money is buying. */}
                  <section className="gr-card gr-creative-section">
                    <header className="gr-card__header">
                      <h3 className="gr-card__title gr-type-card-heading">Running now</h3>
                    </header>
                    <CampaignPreview
                      channel={channel}
                      range={range}
                      onOpen={(id) => openCampaign(id, channel)}
                    />
                  </section>

                  {/* key: the table copies `channel` into its filter state once,
                      so switching channel must give it a fresh mount -- or the
                      Paid Search page lists Meta's campaigns. */}
                  <CampaignTable
                    key={channel ?? 'all'}
                    channel={channel}
                    wideColumns={!chatOpen}
                    onOpenCampaign={(id) => openCampaign(id, channel)}
                  />
                </>
              )}
            </>
          )}

          {nav === 'channels' && !onChannelScreen && (
            <ChannelTable rows={view.rows.map((r) => ({ ...r, delta: channelChange(r.key, tableMetric, range) }))}
                          metric={tableMetric} wideColumns={!chatOpen}
                          range={range}
                          onMetricChange={setTableMetric}
                          total={{ delta: blendedDelta(tableMetric, enabled, range), trend: sparkline('all', 'ROAS', range) }}
                          onRowClick={(k) => setChannel(k)}
                          onAskAbout={askAbout} />
          )}

          {/* Deepest tier first. The chain is campaign → ad set → ad, and Back
              walks it one step at a time: an ad opened from an ad set returns to
              that ad set, not past it to the campaign. */}
          {/* A real account still loading: say so, rather than letting a
              detail page announce that the campaign "no longer exists". */}
          {nav === 'campaigns' && source.status === 'loading' && (campaignId || adSetId || adId) && (
            <div className="gr-card"><p className="gr-type-body" role="status">Loading your account…</p></div>
          )}
          {nav === 'campaigns' && !(source.status === 'loading' && (campaignId || adSetId || adId)) && (adId
            ? (
              <AdDetail
                id={adId}
                range={range}
                onBack={() => setAdId(null)}
                /* Names where Back actually lands. Opened from an ad set, that
                   is the ad set -- labelling it with the campaign would offer a
                   screen the button does not go to. */
                backLabel={adSetId
                  ? (adSetById(adSetId)?.adSet.name ?? 'Ad set')
                  : (CAMPAIGNS.find((c) => c.id === campaignId)?.name ?? 'Campaign')}
              />
            )
            : adSetId
            ? (
              <AdSetDetail
                id={adSetId}
                range={range}
                metric={metric}
                onBack={() => setAdSetId(null)}
                backLabel={CAMPAIGNS.find((c) => c.id === campaignId)?.name ?? 'Campaign'}
                onOpenAd={setAdId}
              />
            )
            : campaignId
            ? (
              <CampaignDetail
                id={campaignId}
                metric={metric}
                range={range}
                onBack={closeCampaign}
                backLabel={cameFrom ? CHANNEL_LABEL[cameFrom] : 'Campaigns'}
                onDiscuss={(m) => shareCampaign(campaignId, m)}
                onAsk={(q) => askAbout(q)}
                onOpenAd={setAdId}
                onOpenAdSet={setAdSetId}
                wideColumns={!chatOpen}
              />
            )
            : <CampaignTable wideColumns={!chatOpen} onOpenCampaign={(id) => openCampaign(id)}
                             onAskAbout={askAbout} />)}

          {/* The cross-channel ad ranking, and an ad opened FROM it returns to
              it -- the breadcrumb has to name where Back actually lands, and
              from here that is the ranking rather than a campaign. */}
          {nav === 'ads' && (adId
            ? (
              <AdDetail
                id={adId}
                range={range}
                onBack={() => setAdId(null)}
                backLabel="All ads"
              />
            )
            : <Ads range={range} onOpenAd={setAdId} onAskAbout={askAbout} />)}

          {nav === 'decisions' && (
            <Decisions
              range={range}
              onDiscuss={askAbout}
              onOpen={openTarget}
              onShare={(d) => { setPendingDecision(d); setChatOpen(true); }}
            />
          )}

          {nav === 'reports' && <Reports onSend={(r) => { setPendingReport(r); setChatOpen(true); }} />}
          {nav === 'notifications' && (
            <Notifications
              onOpenDecisions={() => { setCampaignId(null); setAdSetId(null); setAdId(null); setNav('decisions'); }}
              /* Set the view first, then go -- so the page and the assistant
                 show the number the alert stated. */
              /* The alert's week is the window's last week -- keep where the
                 window ENDS, or a custom window's alert opens on different
                 days than it described. */
              onOpen={(t, v) => {
                if (v?.range) setWindow(v.range, endBack);
                if (v?.metric) setMetric(v.metric);
                openTarget(t);
              }}
              onAsk={(q, t, v) => {
                if (v?.range) setWindow(v.range, endBack);
                if (v?.metric) setMetric(v.metric);
                askAbout(q, t);
              }}
            />
          )}
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

      <Assistant
        open={assistOpen}
        onClose={() => setAssistOpen(false)}
        range={range}
        seed={assistSeed}
        seedSubject={assistSubject}
        onSeedConsumed={() => { setAssistSeed(null); setAssistSubject(null); }}
      />

      {/* ⭐ The phone's navigation -- hidden above 640px, where the sidebar is. */}
      <BottomNav active={nav} counts={navCounts}
                 onNavigate={navigateTo}
                 onTeam={() => setChatOpen(true)}
                 onExport={() => downloadCsv(scope, range)} />

      {chatOpen && (
        <ChatPanel
          onClose={() => setChatOpen(false)}
          pending={pendingView}
          onClearPending={() => setPendingView(null)}
          pendingDecision={pendingDecision}
          onClearPendingDecision={() => setPendingDecision(null)}
          pendingReport={pendingReport}
          onClearPendingReport={() => setPendingReport(null)}
          onOpenDecision={() => { setCampaignId(null); setAdSetId(null); setAdId(null); setNav('decisions'); }}
          initialConversationId={deepLink?.conversationId ?? null}
          onOpenView={applyView}
        />
      )}
    </div>
  );
}

/**
 * The card's label.
 *
 * On a channel screen the bare metric name is right -- the header already says
 * which channel, so "Meta · CAC" would say it twice. On Overview the number is an
 * aggregate and the label has to admit it: a count is a TOTAL, a rate is
 * BLENDED, and those are different words because they are different operations.
 * Calling a summed figure "blended" or a spend-weighted ratio a "total" would be
 * the label describing the wrong arithmetic.
 */
function kpiLabel(m: DerivedMetric, onChannelScreen: boolean): string {
  if (onChannelScreen) return m;
  const RATES = new Set<DerivedMetric>(['CTR', 'CPC', 'CPM', 'CVR', 'CAC', 'ROAS']);
  return RATES.has(m) ? `Blended ${m}` : `Total ${m.toLowerCase()}`;
}

function navTitle(nav: NavKey): string {
  return nav === 'overview' ? 'Overview' : nav[0].toUpperCase() + nav.slice(1);
}

/* The assistant's mark -- the same asterisk its panel header wears, so the AI
   has one symbol wherever it appears. */
function IconAsk() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M7 1.5v11M1.5 7h11M3.2 3.2l7.6 7.6M10.8 3.2l-7.6 7.6" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
    </svg>
  );
}
