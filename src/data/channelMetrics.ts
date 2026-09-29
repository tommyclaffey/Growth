import type { ChannelName } from '../styles/tokens';
import { formatMoney, type DayRow } from './metrics';

/**
 * What each channel can honestly report.
 *
 * The page showed the same four metrics for every campaign. That is wrong in
 * both directions: it prints numbers a channel never produces, and hides the
 * ones it is actually bought on.
 *
 * ⭐ The clearest case is podcasts. A podcast ad has no click — it is audio, it
 * is sold on CPM against impressions, and it is attributed with a promo code or
 * a vanity URL. Printing a CTR for it is not a rounding problem; it is a metric
 * the medium does not have.
 *
 * The rest follow the same rule — show what the channel is bought and judged on:
 *
 *   Meta, TikTok    full funnel: impressions, clicks, CTR, CPC, CPM
 *   YouTube         bought on CPM against views, so CPC is not the lever
 *   Paid Search     intent-driven; impressions are context, not the buy
 *   Affiliates      paid on performance — impressions are neither bought
 *                   nor reported, so CPM would be a fiction
 *   Podcasts        impressions and CPM; no click exists
 */

export type DerivedMetric =
  | 'Spend' | 'Impressions' | 'Clicks' | 'Leads' | 'Sales'
  | 'CTR' | 'CPC' | 'CPM' | 'CAC' | 'ROAS' | 'CVR';

/**
 * How a metric's small trend mark is drawn.
 *
 * A count or an amount (Spend, Leads, Clicks...) adds up day to day, so a bar
 * per day is honest. A rate or a ratio (CAC, ROAS, CTR, CPC, CPM, CVR) does
 * not add up -- two days at 4x are not 8x -- so it is drawn as a line, the
 * same rule the big chart follows. Accepts a plain string so both metric sets
 * (Overview's Metric and a campaign's DerivedMetric) use the one rule.
 */
const RATE_METRICS = new Set(['CAC', 'ROAS', 'CTR', 'CPC', 'CPM', 'CVR']);
export function trendMark(metric: string): 'bars' | 'line' {
  return RATE_METRICS.has(metric) ? 'line' : 'bars';
}

/** Metrics this channel is allowed to display, in reporting order. */
export const CHANNEL_METRICS: Record<ChannelName, DerivedMetric[]> = {
  meta:       ['Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'CPM', 'Leads', 'CAC', 'ROAS'],
  tiktok:     ['Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'CPM', 'Leads', 'CAC', 'ROAS'],
  youtube:    ['Spend', 'Impressions', 'Clicks', 'CTR', 'CPM', 'Leads', 'CAC', 'ROAS'],
  paidSearch: ['Spend', 'Clicks', 'CTR', 'CPC', 'Leads', 'CVR', 'CAC', 'ROAS'],
  affiliates: ['Spend', 'Clicks', 'Leads', 'CVR', 'CAC', 'ROAS'],
  podcasts:   ['Spend', 'Impressions', 'CPM', 'Leads', 'CAC', 'ROAS'],
};

/** What the campaign is trying to move, given what it was built for. */
const OBJECTIVE_PRIORITY: Record<string, DerivedMetric[]> = {
  Awareness:   ['Impressions', 'CPM', 'CTR', 'Clicks'],
  Traffic:     ['Clicks', 'CTR', 'CPC', 'CVR'],
  Conversions: ['Leads', 'CAC', 'CVR', 'ROAS'],
  Sales:       ['Sales', 'ROAS', 'CAC', 'Leads'],
};

/**
 * The four KPIs for a campaign: Spend, then the objective's priorities filtered
 * to what the channel can actually report, then whatever the channel offers.
 *
 * Spend is always first because it is the one question every objective and
 * every channel shares. The intersection is what makes an Awareness campaign on
 * podcasts show CPM while the same objective on Meta shows CTR.
 */
export function kpisFor(channel: ChannelName, objective: string): DerivedMetric[] {
  const allowed = CHANNEL_METRICS[channel];
  const wanted = OBJECTIVE_PRIORITY[objective] ?? OBJECTIVE_PRIORITY.Conversions;
  const picked: DerivedMetric[] = ['Spend'];
  for (const m of [...wanted, ...allowed]) {
    if (picked.length >= 4) break;
    if (m !== 'Spend' && allowed.includes(m) && !picked.includes(m)) picked.push(m);
  }
  return picked;
}

/**
 * The metrics a SCREEN-level KPI row shows, given what is available.
 *
 * `kpisFor` answers this for a campaign, where there is one objective to serve
 * and four cards to fill. An account or a channel has no single objective, so the
 * order here is the FUNNEL -- what you spent, how many saw it, how many clicked,
 * how well it clicked, how many converted, what each cost, what it returned.
 * Left to right, it reads as the shape of the business.
 *
 * ⚠️ Deliberately NOT "the first N of the channel's list". `CHANNEL_METRICS.meta`
 * is nine long and ends with CAC and ROAS, so taking the first seven would drop
 * exactly the two metrics anyone actually judges a channel on and keep CPM.
 *
 * Filtering a fixed priority order by availability is also what makes it adapt
 * for free: Paid Search has no impressions so it shows six, podcasts have no
 * click so they show five, and neither needed a special case.
 */
const HEADLINE_ORDER: DerivedMetric[] = [
  'Spend', 'Impressions', 'Clicks', 'CTR', 'Leads', 'CAC', 'ROAS',
];

export function headlineKpis(available: DerivedMetric[]): DerivedMetric[] {
  return HEADLINE_ORDER.filter((m) => available.includes(m));
}

/** The metric the chart opens on — the first non-Spend KPI. */
export function headlineFor(channel: ChannelName, objective: string): DerivedMetric {
  return kpisFor(channel, objective)[1] ?? 'Spend';
}

/** Every displayed metric derives from the funnel. Nothing here is invented. */
export function valueOf(m: DerivedMetric, r: {
  spend: number; impressions: number; clicks: number;
  leads: number; sales: number; revenue: number;
}): number {
  switch (m) {
    case 'Spend':       return r.spend;
    case 'Impressions': return r.impressions;
    case 'Clicks':      return r.clicks;
    case 'Leads':       return r.leads;
    case 'Sales':       return r.sales;
    case 'CTR':         return r.impressions > 0 ? (r.clicks / r.impressions) * 100 : 0;
    case 'CPC':         return r.clicks > 0 ? r.spend / r.clicks : 0;
    case 'CPM':         return r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0;
    case 'CVR':         return r.clicks > 0 ? (r.leads / r.clicks) * 100 : 0;
    case 'CAC':         return r.leads > 0 ? r.spend / r.leads : 0;
    case 'ROAS':        return r.spend > 0 ? r.revenue / r.spend : 0;
    default:            return 0;
  }
}

/**
 * Whether a ratio has anything to divide by. valueOf answers 0 when it does not
 * -- fine for a chart axis, WRONG for a ranking: a CAC of "0" for an ad with no
 * leads sorted first as the cheapest ad in the account. Rankings and verdicts
 * ask this first; a metric that cannot be reported is a dash, and sorts last.
 */
export function reportable(m: DerivedMetric, r: { spend: number; impressions: number; clicks: number; leads: number }): boolean {
  switch (m) {
    case 'CAC':                return r.leads > 0;
    case 'ROAS':               return r.spend > 0;
    case 'CTR': case 'CPM':    return r.impressions > 0;
    case 'CPC': case 'CVR':    return r.clicks > 0;
    default:                   return true;
  }
}

/** Lower is better for the cost metrics. Getting this wrong paints a falling CAC red. */
export function betterHigher(m: DerivedMetric): boolean {
  return !(m === 'CAC' || m === 'CPC' || m === 'CPM');
}

function compact(v: number): string {
  const n = Math.round(v);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 100_000)   return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}

export function formatDerived(m: DerivedMetric, v: number): string {
  /* The account's currency, not a hard-coded "$". */
  const money = (n: number, dp = 0) => formatMoney(n, dp);
  switch (m) {
    case 'Spend':       return money(v);
    /* Compacted above six figures. "5,103,333" in a KPI card is nine glyphs
       of precision nobody reads and enough width to shrink the type against
       its neighbours -- the card next to it says "23". Impressions are a scale
       number: the reader wants 5.1M, and the exact figure belongs in an export.
       Below 100k the full number still fits and still means something. */
    case 'Impressions':
    case 'Clicks':
    case 'Leads':
    case 'Sales':       return compact(v);
    case 'CTR':
    case 'CVR':         return `${v.toFixed(2)}%`;
    case 'CPC':         return money(v, 2);
    case 'CPM':         return money(v, 2);
    case 'CAC':         return money(v, 2);
    case 'ROAS':        return `${v.toFixed(1)}x`;
    default:            return String(v);
  }
}

export type { DayRow };

/**
 * Whether this metric is a rate rather than a sum.
 *
 * A ratio cannot be added across days -- a period's CTR is total clicks over
 * total impressions, not the mean of each day's CTR. The card says so, because
 * the alternative is a reader adding two shared cards together and getting a
 * number that is wrong in a way nothing on screen admits.
 *
 * `isRatio` in metrics.ts answers the same question for the six funnel metrics.
 * This one covers the derived vocabulary that campaigns report.
 */
export function isDerivedRatio(m: DerivedMetric): boolean {
  return m === 'CTR' || m === 'CPC' || m === 'CPM'
    || m === 'CAC' || m === 'ROAS' || m === 'CVR';
}

/** Runtime list, for validating untrusted input like a URL or a Slack message. */
export const DERIVED_METRICS: DerivedMetric[] = [
  'Spend', 'Impressions', 'Clicks', 'Leads', 'Sales',
  'CTR', 'CPC', 'CPM', 'CAC', 'ROAS', 'CVR',
];
