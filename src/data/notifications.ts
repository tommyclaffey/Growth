import type { ChannelName } from '../styles/tokens';
import { CAMPAIGNS } from './campaigns';
import { campaignDelta, campaignTotals } from './campaignSeries';
import { stageOf } from './campaignStatus';
import { budgetForRange, channelBudgetForRange } from './profile';
import { prefs } from './prefs';
import type { Target } from './decisions';
import {
  CHANNEL_LABEL, LAST_WEEK, activeChannels, delta, formatMetric, rowsFor, totals, windowLabels,
  type Metric,
} from './metrics';

/**
 * The notification feed, DERIVED from the data.
 *
 * 🚨 It was a hand-typed array: "Meta CAC rose 42% week over week", "Affiliate
 * leads spiked 31%", "Paid Search ROAS fell below the 2.0x floor". Against the
 * data, all three were false -- Meta CAC had fallen 5%, affiliate leads were up
 * 1%, and that ROAS was 3.4x. A notification is a claim about your numbers, and
 * a claim nothing computed is the one thing this product has spent a month
 * removing.
 *
 * Now each alert is a RULE run over the same rows the charts render. If the data
 * says nothing crossed a threshold, the feed says so. The figures in a message
 * are the figures on the page it links to, because they are the same call.
 *
 * ⚠️ "This week" = the last 7 days of data against the 7 before -- `delta(…, 7)`,
 * the exact comparison the 7-day KPI cards show.
 */

export type NoteTone = 'bad' | 'warn' | 'good';
/** What kind of rule raised it -- also what the Settings switches gate. */
export type NoteKind = 'cac' | 'leads' | 'pacing' | 'cost' | 'status' | 'decision';
/** The three sections of the feed, in order. */
export type NoteGroup = 'This week' | 'Standing' | 'Waiting on someone' | 'Your decisions';

export interface Note {
  /** Derived from the rule and its subject, so read-state survives a reload. */
  id: string;
  kind: NoteKind;
  tone: NoteTone;
  group: NoteGroup;
  /** The full sentence, for the feed. */
  message: string;
  /** Four or five words, for the Overview strip pill. */
  short: string;
  /** Opens the Decisions screen instead of a target -- decision events. */
  opensDecisions?: boolean;
  /** What it is about -- where clicking it goes. */
  target: Target;
  /** For the trend mark and the change pill. Absent on status alerts. */
  channel?: ChannelName;
  metric?: Metric;
  /** Week-over-week change, when the rule is a change. */
  change?: number;
  /** Daily values behind the change -- the last 14 days, so both weeks show. */
  trend?: number[];
}

/** The default size of change that counts as news. Below it, a week is just a week. */
export const CHANGE_THRESHOLD = 15;

/** The team's own threshold (Settings), or the default outside a browser. */
export function changeThreshold(): number {
  try { return prefs().changeThreshold; } catch { return CHANGE_THRESHOLD; }
}
/** A channel costing this multiple of blended is worth standing attention. */
const COST_MULTIPLE = 2.5;
/** Pacing further than this from plan either way. */
const PACE_BAND = 0.15;

const pct = (n: number) => `${Math.abs(n)}%`;
const money = (n: number) => formatMetric('CAC', n);

function lastTwoWeeks(ch: ChannelName, m: 'CAC' | 'Leads'): number[] {
  return rowsFor(ch, 30).slice(-LAST_WEEK * 2).map((r) =>
    m === 'CAC' ? (r.leads > 0 ? r.spend / r.leads : 0) : r.leads);
}

/** The week just ended and the one before, as dates. */
export function weekLabels() {
  /* The last week OF THE WINDOW -- with custom dates, "this week" is the
     window's final 7 days, the same days every rule here measures. */
  const now = windowLabels(LAST_WEEK);
  const before = windowLabels(LAST_WEEK, 1);
  return {
    now: `${now[0]} – ${now[now.length - 1]}`,
    before: `${before[0]} – ${before[before.length - 1]}`,
  };
}

export function notifications(channels: ChannelName[] = activeChannels()): Note[] {
  const out: Note[] = [];

  /* ---- 1. What moved this week, per channel. ONE alert per channel: when
     leads and CAC move together they are one event, not two notifications. */
  for (const ch of channels) {
    const cac = delta(ch, 'CAC', LAST_WEEK);
    const leads = delta(ch, 'Leads', LAST_WEEK);
    const name = CHANNEL_LABEL[ch];
    const target: Target = { kind: 'channel', id: ch, label: name };
    const now = totals(ch, LAST_WEEK);

    /* Lead with whichever moved MORE. Meta's story is its cost (+42% CAC, leads
       -29%); Affiliates' is its volume (+31% leads, CAC -21%). Same event shape,
       different headline -- the one a person would say out loud. */
    const cacLeads = Math.abs(cac) >= Math.abs(leads);
    const limit = changeThreshold();
    if (cacLeads && Math.abs(cac) >= limit) {
      const up = cac > 0;
      out.push({
        id: `cac:${ch}`, kind: 'cac', group: 'This week', tone: up ? 'bad' : 'good',
        message: `${name} CAC ${up ? 'rose' : 'fell'} ${pct(cac)} week over week, to ${money(now.cac)} a lead`
          + (Math.abs(leads) >= 5 ? ` — leads ${leads > 0 ? 'up' : 'down'} ${pct(leads)}.` : '.'),
        short: `${name} CAC ${up ? '↑' : '↓'} ${pct(cac)} WoW`,
        target, channel: ch, metric: 'CAC', change: cac, trend: lastTwoWeeks(ch, 'CAC'),
      });
    } else if (Math.abs(leads) >= limit) {
      const up = leads > 0;
      out.push({
        id: `leads:${ch}`, kind: 'leads', group: 'This week', tone: up ? 'good' : 'bad',
        message: `${name} leads ${up ? 'rose' : 'fell'} ${pct(leads)} week over week, to `
          + `${Math.round(now.leads).toLocaleString()} this week`
          + (Math.abs(cac) >= 5 ? ` — CAC ${cac < 0 ? 'down' : 'up'} ${pct(cac)} to ${money(now.cac)}.` : '.'),
        short: `${name} leads ${up ? '↑' : '↓'} ${pct(leads)}`,
        target, channel: ch, metric: 'Leads', change: leads, trend: lastTwoWeeks(ch, 'Leads'),
      });
    }
  }

  /* ---- 1b. A CAMPAIGN that moved on its own.

     A channel number is often an average of one campaign's problem and
     several that are fine. Flagged only when the campaign moved past the
     threshold AND differs from its channel's move by at least half the
     threshold -- otherwise it is the channel's move again, and a second alert
     for the same event is noise. (The seed's campaigns move exactly with their
     channel, so none fire there; real accounts' campaigns do not.) */
  const limitC = changeThreshold();
  for (const c of CAMPAIGNS) {
    if (!channels.includes(c.channel) || stageOf(c.id) !== 'Active') continue;
    const cac = campaignDelta(c.id, 'CAC', LAST_WEEK);
    const leads = campaignDelta(c.id, 'Leads', LAST_WEEK);
    const chCac = delta(c.channel, 'CAC', LAST_WEEK);
    const chLeads = delta(c.channel, 'Leads', LAST_WEEK);
    const useCac = Math.abs(cac) >= Math.abs(leads);
    const move = useCac ? cac : leads;
    const own = Math.abs(move - (useCac ? chCac : chLeads)) >= limitC / 2;
    if (Math.abs(move) < limitC || !own) continue;
    const up = move > 0;
    const bad = useCac ? up : !up;
    const t = campaignTotals(c.id, LAST_WEEK);
    out.push({
      id: `${useCac ? 'cac' : 'leads'}:campaign:${c.id}`, kind: useCac ? 'cac' : 'leads', group: 'This week',
      tone: bad ? 'bad' : 'good',
      message: useCac
        ? `${c.name} CAC ${up ? 'rose' : 'fell'} ${pct(move)} week over week, to ${money(t.cac)} a lead — `
          + `${CHANNEL_LABEL[c.channel]} overall moved ${chCac > 0 ? '+' : ''}${chCac}%.`
        : `${c.name} leads ${up ? 'rose' : 'fell'} ${pct(move)} week over week — `
          + `${CHANNEL_LABEL[c.channel]} overall moved ${chLeads > 0 ? '+' : ''}${chLeads}%.`,
      short: `${c.name} ${useCac ? 'CAC' : 'leads'} ${up ? '↑' : '↓'} ${pct(move)}`,
      target: { kind: 'campaign', id: c.id, label: c.name },
      channel: c.channel, metric: useCac ? 'CAC' : 'Leads', change: move,
    });
  }

  /* ---- 2. Account pacing, against the budget set in Settings. A CHANNEL has
     no target of its own -- "TikTok is pacing 18% behind its monthly target"
     named a number that did not exist anywhere in the product. */
  if (channels.length > 0) {
    const planned = budgetForRange(LAST_WEEK);
    const spent = channels.reduce((a, c) => a + totals(c, LAST_WEEK).spend, 0);
    const ratio = planned > 0 ? spent / planned : 1;
    if (Math.abs(1 - ratio) >= PACE_BAND) {
      const under = ratio < 1;
      const gap = Math.round(Math.abs(1 - ratio) * 100);
      out.push({
        id: 'pacing:account', kind: 'pacing', group: 'Standing', tone: 'warn',
        message: `Spend is pacing ${gap}% ${under ? 'below' : 'above'} plan — `
          + `${formatMetric('Spend', spent)} of ${formatMetric('Spend', planned)} this week.`,
        short: `Pacing ${gap}% ${under ? 'under' : 'over'} plan`,
        target: { kind: 'account', id: 'account', label: 'All channels' },
      });
    }
  }

  /* ---- 2b. A CHANNEL off its own budget -- only where a person set one. */
  for (const ch of channels) {
    const planned = channelBudgetForRange(ch, LAST_WEEK);
    if (!planned) continue;
    const spent = totals(ch, LAST_WEEK).spend;
    const ratio = spent / planned;
    if (Math.abs(1 - ratio) < PACE_BAND) continue;
    const under = ratio < 1;
    const gap = Math.round(Math.abs(1 - ratio) * 100);
    out.push({
      id: `pacing:${ch}`, kind: 'pacing', group: 'Standing', tone: 'warn',
      message: `${CHANNEL_LABEL[ch]} is spending ${gap}% ${under ? 'under' : 'over'} its budget — `
        + `${formatMetric('Spend', spent)} of ${formatMetric('Spend', planned)} this week.`,
      short: `${CHANNEL_LABEL[ch]} ${gap}% ${under ? 'under' : 'over'} budget`,
      target: { kind: 'channel', id: ch, label: CHANNEL_LABEL[ch] },
      channel: ch,
    });
  }

  /* ---- 3. A channel costing a multiple of blended, over the month. Standing,
     not new -- and deliberately worded as a fact, not a verdict. Whether it is
     worth it is the attribution question the Decisions screen refuses. */
  if (channels.length > 1) {
    const all = channels.reduce((a, c) => {
      const t = totals(c, 30);
      return { spend: a.spend + t.spend, leads: a.leads + t.leads };
    }, { spend: 0, leads: 0 });
    const blended = all.leads > 0 ? all.spend / all.leads : 0;
    for (const ch of channels) {
      const cac = totals(ch, 30).cac;
      if (blended > 0 && cac / blended >= COST_MULTIPLE) {
        out.push({
          id: `cost:${ch}`, kind: 'cost', group: 'Standing', tone: 'warn',
          message: `${CHANNEL_LABEL[ch]} CAC is ${money(cac)} — ${(cac / blended).toFixed(1)}× the blended ${money(blended)} over 30 days.`,
          short: `${CHANNEL_LABEL[ch]} CAC ${(cac / blended).toFixed(1)}× blended`,
          target: { kind: 'channel', id: ch, label: CHANNEL_LABEL[ch] },
          channel: ch, metric: 'CAC',
        });
      }
    }
  }

  /* ---- 4. Campaigns waiting on a person. Read from the LIVE stage, so
     approving one on its page clears this. */
  for (const c of CAMPAIGNS) {
    if (!channels.includes(c.channel) || stageOf(c.id) !== 'Review') continue;
    out.push({
      id: `review:${c.id}`, kind: 'status', group: 'Waiting on someone', tone: 'warn',
      message: `${c.name} is waiting in Review. Nothing about it changes until someone approves or ends it.`,
      short: `${c.name} in Review`,
      target: { kind: 'campaign', id: c.id, label: c.name },
      channel: c.channel,
    });
  }

  return out;
}

export const NOTE_GROUPS: NoteGroup[] = ['Your decisions', 'This week', 'Standing', 'Waiting on someone'];
