import type { ChannelName } from '../../styles/tokens';
import type { DayRow } from '../metrics';
import type { SourceAd, SourceAdSet, SourceCampaign, SourceData } from '../source';
import { dayList, lastCompleteDay } from './metaNormalize';

/**
 * Google Ads API responses → the product's rows.
 *
 * PURE, like the Meta normaliser -- tested against the documented REST shapes
 * before any developer token exists. The requests live in server/googleAdsApi.ts.
 *
 * Shapes (REST, googleAds:searchStream, flattened across batches):
 *   every row is { campaign?, adGroup?, adGroupAd?, segments?, metrics? }
 *   field names are camelCase ("costMicros", "advertisingChannelType")
 *   int64 fields arrive as STRINGS ("12000"); doubles as numbers
 *   ⚠️ zero-valued fields are OMITTED entirely (proto3 JSON) -- a day with no
 *      clicks has no `clicks` key, so every read defaults to 0
 *   money is in MICROS -- 1,000,000 micros = one unit of the account currency
 *
 * Four things Google does differently from Meta, each handled below:
 *   1. Conversions cannot be split by category in the same query as cost. So
 *      performance and conversions arrive as SEPARATE rows and are merged here.
 *   2. Conversions are fractional under data-driven attribution (0.37 of a
 *      lead). Kept as-is: rounding each day would lose leads over 90 days.
 *   3. Performance Max has no ad groups or ads to report on. Those campaigns
 *      come from campaign-level rows and show no ad sets -- "not loaded", not
 *      "none".
 *   4. VIDEO campaigns are YouTube. They are routed to the YouTube channel, so
 *      the product's channel list matches how a team thinks about its spend.
 */

export interface GText { text?: string }
export interface GRow {
  campaign?: { id?: string; name?: string; status?: string; servingStatus?: string; advertisingChannelType?: string };
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupAd?: {
    status?: string;
    policySummary?: { reviewStatus?: string; approvalStatus?: string };
    ad?: {
      id?: string; name?: string; type?: string;
      responsiveSearchAd?: { headlines?: GText[]; descriptions?: GText[] };
      responsiveDisplayAd?: { headlines?: GText[]; longHeadline?: GText; descriptions?: GText[] };
      videoResponsiveAd?: { headlines?: GText[]; longHeadlines?: GText[]; descriptions?: GText[] };
    };
  };
  segments?: { date?: string; conversionActionCategory?: string };
  metrics?: {
    costMicros?: string; impressions?: string; clicks?: string;
    conversions?: number; conversionsValue?: number;
  };
}
export interface GCustomer { descriptiveName?: string; currencyCode: string; timeZone: string }

/*
 * Conversion categories → the product's two outcomes.
 *
 * ⚠️ QUALIFIED_LEAD and CONVERTED_LEAD are LATER STAGES of a lead already
 * counted when it was submitted -- adding them counts one person two or three
 * times. They are excluded, the same way Meta's overlapping action types are.
 *
 * ⚠️ DEFAULT ("Other" in the Google Ads UI) is counted as a lead. Many lead-gen
 * accounts never categorise their conversion actions, and leaving them out
 * would show those accounts as having no leads at all. A purchase filed as
 * "Other" will be counted as a lead -- fix the category in Google Ads, not here.
 *
 * Micro-steps (page views, add to cart, outbound clicks, directions) are not
 * outcomes and are not counted as either.
 */
export const LEAD_CATEGORIES = [
  'DEFAULT', 'LEAD', 'SIGNUP', 'SUBMIT_LEAD_FORM', 'PHONE_CALL_LEAD', 'IMPORTED_LEAD',
  'BOOK_APPOINTMENT', 'REQUEST_QUOTE', 'CONTACT',
];
export const SALE_CATEGORIES = ['PURCHASE', 'SUBSCRIBE_PAID', 'STORE_SALE'];

/** Google's campaign status + serving status → the product's stage. */
export function stageOfGoogleCampaign(status?: string, serving?: string): SourceCampaign['stage'] {
  if (status === 'REMOVED') return 'Ended';
  if (status === 'PAUSED') return 'Paused';
  if (status !== 'ENABLED') return 'Draft';
  switch (serving) {
    case 'ENDED': return 'Ended';
    case 'PENDING': return 'Draft';        // start date in the future
    case 'SUSPENDED': return 'Paused';     // billing, usually
    default: return 'Active';
  }
}

/** An ad: its status, and whether Google is still reviewing it. */
export function stageOfGoogleAd(status?: string, review?: string): SourceCampaign['stage'] {
  if (status === 'REMOVED') return 'Ended';
  if (status === 'PAUSED') return 'Paused';
  if (status !== 'ENABLED') return 'Draft';
  return review === 'REVIEW_IN_PROGRESS' ? 'Review' : 'Active';
}

/**
 * Google's advertising channel type → the objective that decides which KPIs
 * show. Google has no "objective" field on the campaign; the channel type is
 * the nearest honest proxy.
 */
export function objectiveOfGoogle(t?: string): string {
  switch (t) {
    case 'SHOPPING': return 'Sales';
    case 'DISPLAY': case 'VIDEO': return 'Awareness';
    default: return 'Conversions';   // SEARCH, PERFORMANCE_MAX, DEMAND_GEN, SMART, LOCAL…
  }
}

export function channelOfGoogle(t?: string): ChannelName {
  return t === 'VIDEO' ? 'youtube' : 'paidSearch';
}

function kindOf(type?: string): SourceAd['kind'] {
  if (!type) return 'text';
  if (type.includes('VIDEO')) return 'video';
  if (type.includes('DISPLAY') || type.includes('IMAGE')) return 'image';
  return 'text';   // responsive search, expanded text, call ads
}

/** The first headline and description of whichever ad format this is. */
function copyOf(ad: NonNullable<NonNullable<GRow['adGroupAd']>['ad']>): { headline?: string; body?: string } {
  const f = ad.responsiveSearchAd ?? ad.responsiveDisplayAd ?? ad.videoResponsiveAd;
  return { headline: f?.headlines?.[0]?.text, body: f?.descriptions?.[0]?.text };
}

const zero = (): DayRow => ({ spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });
const add = (into: DayRow[], from: DayRow[]) => from.forEach((r, i) => {
  into[i].spend += r.spend; into[i].impressions += r.impressions; into[i].clicks += r.clicks;
  into[i].leads += r.leads; into[i].sales += r.sales; into[i].revenue += r.revenue;
});

/** One metrics row into one day. Performance rows and conversion rows both land here. */
function accumulate(day: DayRow, r: GRow) {
  const m = r.metrics ?? {};
  const cat = r.segments?.conversionActionCategory;
  if (cat === undefined) {
    /* A performance row: cost and reach. Its `conversions` (if selected) are
       ignored -- they are counted from the category rows, once. */
    day.spend += (Number(m.costMicros) || 0) / 1_000_000;
    day.impressions += Number(m.impressions) || 0;
    day.clicks += Number(m.clicks) || 0;
    return;
  }
  const n = Number(m.conversions) || 0;
  if (LEAD_CATEGORIES.includes(cat)) day.leads += n;
  else if (SALE_CATEGORIES.includes(cat)) {
    day.sales += n;
    day.revenue += Number(m.conversionsValue) || 0;
  }
}

export function normalizeGoogle(input: {
  customer: GCustomer;
  /** FROM campaign (no metrics) -- every campaign, delivering or not. */
  campaigns: GRow[];
  /** FROM ad_group. */
  adGroups?: GRow[];
  /** FROM ad_group_ad. */
  ads?: GRow[];
  /**
   * Daily metrics, any mix of: campaign-level and ad-level rows, performance
   * rows (cost, impressions, clicks) and conversion rows (segmented by
   * conversion_action_category). A row with an ad id is ad-level.
   */
  metrics: GRow[];
  now: Date;
  days: number;
}): SourceData {
  const periodEnd = lastCompleteDay(input.customer.timeZone, input.now);
  const dates = dayList(periodEnd, input.days);
  const index = new Map(dates.map((d, i) => [d, i]));

  type C = { id: string; name: string; status?: string; serving?: string; type?: string };
  const camps = new Map<string, C>();
  const remember = (c: GRow['campaign'], fallback: boolean) => {
    if (!c?.id) return;
    const had = camps.get(c.id);
    if (had && fallback) return;
    camps.set(c.id, {
      id: c.id, name: c.name ?? had?.name ?? `Campaign ${c.id}`,
      status: fallback ? 'REMOVED' : c.status, serving: c.servingStatus, type: c.advertisingChannelType ?? had?.type,
    });
  };
  for (const r of input.campaigns) remember(r.campaign, false);

  const groups = new Map<string, { id: string; name: string; campaignId: string; status?: string }>();
  for (const r of input.adGroups ?? []) {
    if (r.adGroup?.id && r.campaign?.id) {
      groups.set(r.adGroup.id, { id: r.adGroup.id, name: r.adGroup.name ?? `Ad group ${r.adGroup.id}`, campaignId: r.campaign.id, status: r.adGroup.status });
    }
  }

  type A = { id: string; groupId: string; campaignId: string; row: GRow };
  const ads = new Map<string, A>();
  for (const r of input.ads ?? []) {
    const id = r.adGroupAd?.ad?.id;
    if (id && r.adGroup?.id && r.campaign?.id) ads.set(id, { id, groupId: r.adGroup.id, campaignId: r.campaign.id, row: r });
  }

  const campaignRows = new Map<string, DayRow[]>();
  const adRows = new Map<string, DayRow[]>();
  const adLevelCampaigns = new Set<string>();

  for (const r of input.metrics) {
    const i = index.get(r.segments?.date ?? '');
    const cid = r.campaign?.id;
    if (i === undefined || !cid) continue;
    /* Delivered in the window but not in the campaigns call (removed since) --
       keep its numbers, and its name if the metrics row carried one. */
    if (!camps.has(cid)) remember(r.campaign, true);

    const adId = r.adGroupAd?.ad?.id;
    if (adId) {
      adLevelCampaigns.add(cid);
      if (!ads.has(adId)) {
        const gid = r.adGroup?.id ?? `${cid}-unknown`;
        ads.set(adId, { id: adId, groupId: gid, campaignId: cid, row: { adGroupAd: { status: 'REMOVED', ad: { id: adId } } } });
      }
      const gid = ads.get(adId)!.groupId;
      if (!groups.has(gid)) groups.set(gid, { id: gid, name: r.adGroup?.name ?? `Ad group ${gid}`, campaignId: cid, status: 'REMOVED' });
      if (!adRows.has(adId)) adRows.set(adId, dates.map(zero));
      accumulate(adRows.get(adId)![i], r);
    } else {
      if (!campaignRows.has(cid)) campaignRows.set(cid, dates.map(zero));
      accumulate(campaignRows.get(cid)![i], r);
    }
  }

  const campaigns: SourceCampaign[] = [...camps.values()].map((c) => {
    const base = {
      id: `google-${c.id}`, name: c.name, channel: channelOfGoogle(c.type),
      stage: stageOfGoogleCampaign(c.status, c.serving), objective: objectiveOfGoogle(c.type),
    };
    /* No ad-level rows (Performance Max, or nothing ran): the campaign's own
       numbers, and the ad tier stays unloaded rather than shown empty. */
    if (!adLevelCampaigns.has(c.id)) {
      return { ...base, rows: campaignRows.get(c.id) ?? dates.map(zero) };
    }

    /* Ad level: ads are the unit, ad groups and the campaign are their sums --
       the tiers reconcile by construction, as on Meta. */
    const sets = new Map<string, SourceAdSet>();
    for (const g of groups.values()) {
      if (g.campaignId === c.id) {
        sets.set(g.id, { id: `google-${g.id}`, name: g.name, stage: stageOfGoogleCampaign(g.status), rows: dates.map(zero) });
      }
    }
    const mine: SourceAd[] = [...ads.values()].filter((a) => a.campaignId === c.id).map((a) => {
      const rows = adRows.get(a.id) ?? dates.map(zero);
      const set = sets.get(a.groupId);
      if (set) add(set.rows, rows);
      const ad = a.row.adGroupAd?.ad ?? {};
      const copy = copyOf(ad);
      const name = ad.name || copy.headline || `Ad ${a.id}`;
      return {
        id: `google-${a.id}`, adSetId: `google-${a.groupId}`, name,
        headline: copy.headline ?? name, body: copy.body ?? '',
        kind: kindOf(ad.type),
        stage: stageOfGoogleAd(a.row.adGroupAd?.status, a.row.adGroupAd?.policySummary?.reviewStatus),
        rows,
      };
    });
    const sum = dates.map(zero);
    for (const a of mine) add(sum, a.rows);
    return { ...base, rows: sum, adSets: [...sets.values()], ads: mine };
  });

  /* Each channel is the sum of its campaigns. */
  const rows: SourceData['rows'] = {};
  for (const c of campaigns) {
    const into = (rows[c.channel] ??= dates.map(zero));
    add(into, c.rows);
  }

  return {
    account: {
      name: input.customer.descriptiveName || 'Google Ads account',
      currency: input.customer.currencyCode,
      timezone: input.customer.timeZone,
      periodEnd,
    },
    rows,
    campaigns,
  };
}

/* ---------------------------------------------------------------- accounts */

export interface GoogleAccount { id: string; name: string; currency: string; loginCustomerId: string }

/**
 * The ad accounts a person can read, from `customer_client` rows queried under
 * each directly-accessible customer.
 *
 * ⚠️ Manager (MCC) accounts hold no ads -- they are listed out, and their
 * clients are listed in, each remembering the manager it was reached through.
 * Querying a client without that manager as `login-customer-id` is refused.
 */
export function accountsFrom(
  byRoot: { root: string; rows: { customerClient?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean; status?: string } }[] }[],
): GoogleAccount[] {
  const out = new Map<string, GoogleAccount>();
  for (const { root, rows } of byRoot) {
    for (const r of rows) {
      const c = r.customerClient;
      if (!c?.id || c.manager || (c.status && c.status !== 'ENABLED')) continue;
      if (out.has(c.id)) continue;
      out.set(c.id, { id: c.id, name: c.descriptiveName || `Account ${c.id}`, currency: c.currencyCode ?? '', loginCustomerId: root });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------ errors */

/**
 * Google's error body → one sentence a person can act on.
 *
 * The raw message for a test-level developer token is "The developer token is
 * only approved for use with test accounts" -- accurate, and useless unless you
 * know what to do next. The common ones are translated; anything else is passed
 * through as Google said it.
 */
export function googleErrorMessage(body: unknown, status: number): string {
  type Failure = { errors?: { errorCode?: Record<string, string>; message?: string }[] };
  const e = (Array.isArray(body) ? body[0] : body) as { error?: { message?: string; details?: Failure[] } } | undefined;
  const first = e?.error?.details?.find((d) => d.errors?.length)?.errors?.[0];
  const code = first?.errorCode ? Object.values(first.errorCode)[0] : undefined;
  switch (code) {
    /* Since Sept 9, 2026 access belongs to the Cloud project, not a token. */
    case 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION':
      return 'Your Google Cloud project only has Test access, which reads test accounts. In Cloud Console open Google Ads API → Upgrade access level and apply for Explorer access.';
    case 'DEVELOPER_TOKEN_NOT_APPROVED':
      return 'Your Google Ads developer token is approved for test accounts only. Apply for Basic access in the API Center, or choose a test account.';
    case 'DEVELOPER_TOKEN_PROHIBITED':
      return 'This developer token cannot be used with this Google Cloud project. Use the token from the manager account linked to this project.';
    case 'USER_PERMISSION_DENIED':
      return 'The signed-in Google user has no access to this ad account through the manager it was chosen under. Choose the account again in Settings.';
    case 'CUSTOMER_NOT_ENABLED':
      return 'This Google Ads account is not enabled (cancelled or never finished setup). Choose another account in Settings.';
    case 'NOT_ADS_USER':
      return 'The signed-in Google user is not a Google Ads user. Sign in with the account that has access to the ads.';
  }
  return first?.message ?? e?.error?.message ?? `Google Ads returned ${status}`;
}
