import type { DayRow } from '../metrics';
import type { SourceCampaign, SourceData } from '../source';

/**
 * Meta Marketing API responses → the product's rows.
 *
 * PURE -- no fetch, no clock -- so it is tested against Meta's documented
 * response shapes before any real account exists, and the server and any
 * future worker share one mapping. The request side lives in server/metaApi.ts.
 *
 * Shapes (Graph API v21):
 *   GET act_{id}?fields=name,currency,timezone_name
 *   GET act_{id}/campaigns?fields=id,name,objective,effective_status
 *   GET act_{id}/insights?level=campaign&time_increment=1
 *       &fields=campaign_id,campaign_name,spend,impressions,clicks,actions,action_values
 * Every number arrives as a STRING. Conversions arrive inside `actions` as
 * { action_type, value } pairs.
 */

export interface MetaAction { action_type: string; value: string }
export interface MetaInsight {
  campaign_id: string;
  campaign_name?: string;
  date_start: string;          // "2026-09-01"
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}
export interface MetaCampaign { id: string; name: string; objective?: string; effective_status?: string }
export interface MetaAccount { name: string; currency: string; timezone_name: string }

/*
 * ⚠️ Meta reports ONE conversion under several overlapping action types --
 * a pixel lead is counted as `offsite_conversion.fb_pixel_lead` AND rolled up
 * into `lead`. Summing them double-counts. The first type present wins, most
 * inclusive first.
 */
export const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
export const PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];

function pick(list: MetaAction[] | undefined, types: string[]): number {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

/** Meta's effective_status → the product's stage vocabulary. */
export function stageOfMeta(s?: string): SourceCampaign['stage'] {
  switch (s) {
    case 'ACTIVE': return 'Active';
    case 'PAUSED': case 'CAMPAIGN_PAUSED': case 'ADSET_PAUSED': case 'WITH_ISSUES': return 'Paused';
    case 'DELETED': case 'ARCHIVED': return 'Ended';
    case 'IN_PROCESS': case 'PENDING_REVIEW': case 'PENDING_BILLING_INFO': return 'Review';
    default: return 'Draft';
  }
}

/** Meta's ODAX objectives → the objective names that decide which KPIs show. */
export function objectiveOfMeta(o?: string): string {
  switch (o) {
    case 'OUTCOME_AWARENESS': case 'BRAND_AWARENESS': case 'REACH': return 'Awareness';
    case 'OUTCOME_TRAFFIC': case 'LINK_CLICKS': return 'Traffic';
    case 'OUTCOME_SALES': case 'CONVERSIONS': case 'PRODUCT_CATALOG_SALES': return 'Sales';
    default: return 'Conversions';   // OUTCOME_LEADS, OUTCOME_ENGAGEMENT, app promotion
  }
}

/**
 * The last COMPLETE day in the account's own timezone -- "yesterday" there.
 * Meta's today is partial until midnight in the ad account's zone, and a
 * partial day at the end of every chart reads as a collapse.
 */
export function lastCompleteDay(timezone: string, now: Date): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);                                         // "2026-09-29"
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** ISO dates, oldest first, `n` days ending on `end` inclusive. */
export function dayList(end: string, n: number): string[] {
  const out: string[] = [];
  const d = new Date(`${end}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const zero = (): DayRow => ({ spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });

export function normalizeMeta(input: {
  account: MetaAccount;
  campaigns: MetaCampaign[];
  insights: MetaInsight[];
  now: Date;
  days: number;
}): SourceData {
  const periodEnd = lastCompleteDay(input.account.timezone_name, input.now);
  const dates = dayList(periodEnd, input.days);
  const index = new Map(dates.map((d, i) => [d, i]));

  /* Every campaign the account has, even ones with no delivery in the window
     -- a paused campaign is still a campaign on the list. */
  const rowsBy = new Map<string, DayRow[]>();
  const meta = new Map<string, MetaCampaign>();
  for (const c of input.campaigns) {
    meta.set(c.id, c);
    rowsBy.set(c.id, dates.map(zero));
  }

  for (const r of input.insights) {
    const i = index.get(r.date_start);
    if (i === undefined) continue;   // outside the window
    if (!rowsBy.has(r.campaign_id)) {
      /* Delivered in the window but missing from the campaigns call (deleted
         since) -- keep its numbers, name it from the insight. */
      rowsBy.set(r.campaign_id, dates.map(zero));
      meta.set(r.campaign_id, { id: r.campaign_id, name: r.campaign_name ?? r.campaign_id, effective_status: 'DELETED' });
    }
    const row = rowsBy.get(r.campaign_id)![i];
    row.spend += Number(r.spend) || 0;
    row.impressions += Number(r.impressions) || 0;
    row.clicks += Number(r.clicks) || 0;
    row.leads += pick(r.actions, LEAD_TYPES);
    row.sales += pick(r.actions, PURCHASE_TYPES);
    row.revenue += pick(r.action_values, PURCHASE_TYPES);
  }

  const campaigns: SourceCampaign[] = [...rowsBy.entries()].map(([id, rows]) => {
    const c = meta.get(id)!;
    return {
      id: `meta-${id}`, name: c.name, channel: 'meta',
      stage: stageOfMeta(c.effective_status), objective: objectiveOfMeta(c.objective), rows,
    };
  });

  /* The channel is the sum of its campaigns -- by construction, so they cannot
     disagree. */
  const channel = dates.map((_, i) => campaigns.reduce<DayRow>((a, c) => {
    const r = c.rows[i];
    return {
      spend: a.spend + r.spend, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks,
      leads: a.leads + r.leads, sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
    };
  }, zero()));

  return {
    account: {
      name: input.account.name,
      currency: input.account.currency,
      timezone: input.account.timezone_name,
      periodEnd,
    },
    rows: { meta: channel },
    campaigns,
  };
}
