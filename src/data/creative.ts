import type { ChannelName } from '../styles/tokens';
import type { Stage } from '../components/StatusPill/StatusPill';
import { CAMPAIGNS, type AdSet, type Campaign } from './campaigns';
import { campaignRows, campaignSeries } from './campaignSeries';
import { sliceWindow, type DayRow, type Metric, type Range } from './metrics';
import { assetFor } from './creativeAssets';
import { CHANNEL_DEPTH } from './channelDepth';
import { AD_SPREAD, adSetLeadShare, adSetWobble } from './adSets';

/**
 * The assets running inside a campaign.
 *
 * ⭐ The format follows the CHANNEL, for the same reason the metrics do. A
 * paid-search ad has no image -- it is three headlines and a description. A
 * podcast spot has no visual at all; it is a host read with a duration. Giving
 * every channel an image thumbnail would be the creative equivalent of showing
 * a podcast a click-through rate.
 *
 * ⭐ ONE master asset, cropped per placement. That is not a shortcut -- it is
 * how ad accounts actually work. You upload a master, and Meta serves it as
 * 1:1 in feed, 4:5 in the mobile feed and 9:16 in stories, cropping to fit
 * each. Showing the same asset in three differently-shaped frames is the
 * honest picture of what is running, and it makes the crop problem visible:
 * a headline that survives 1:1 can be cut off at 9:16, which is the single
 * most common creative defect in a paid account.
 *
 * Text and audio formats render their ACTUAL content, because copy and a
 * script are things this data can honestly hold. Only video has no still to
 * show, so it keeps a frame with a duration on it.
 */
export type CreativeKind = 'image' | 'video' | 'text' | 'audio' | 'link';

export interface Creative {
  id: string;
  adSetId: string;
  adSetName: string;
  kind: CreativeKind;
  /** Aspect ratio, visual formats only. */
  ratio?: '1:1' | '4:5' | '9:16' | '16:9';
  /** Runtime in seconds, for video and audio. */
  seconds?: number;
  headline: string;
  body: string;
  cta?: string;
  /** Display URL — what a search or affiliate placement actually shows. */
  destination?: string;
  /** The master asset, for formats that have one. */
  src?: string;
  /**
   * Where the crop is anchored, as a CSS object-position.
   *
   * The master is a tall poster. A 16:9 frame keeps a horizontal band of it,
   * and WHICH band is a real creative decision -- anchoring everything to the
   * centre would silently cut the headline out of the wide placements.
   */
  focus?: string;
  stage: Stage;
  /** Share of its ad set's spend. Shares within an ad set sum to 1. */
  spend: number;
  leads: number;
}

/* What each channel can actually run. Ordered, and cycled through per ad set,
   so a Meta ad set shows the square, the vertical and the story rather than
   three of the same shape. */
/* Crop anchors per ratio. The master is 4:5, so that one needs no adjustment;
   the square and the wide crops have to choose what to keep. */
const FOCUS: Record<string, string> = {
  '1:1': '50% 30%',
  '4:5': '50% 50%',
  '9:16': '50% 35%',
  '16:9': '50% 25%',
};

const FORMATS: Record<ChannelName, { kind: CreativeKind; ratio?: Creative['ratio']; seconds?: number }[]> = {
  meta:       [{ kind: 'image', ratio: '1:1' }, { kind: 'image', ratio: '4:5' }, { kind: 'video', ratio: '9:16', seconds: 15 }],
  tiktok:     [{ kind: 'video', ratio: '9:16', seconds: 21 }, { kind: 'video', ratio: '9:16', seconds: 34 }],
  youtube:    [{ kind: 'video', ratio: '16:9', seconds: 30 }, { kind: 'video', ratio: '16:9', seconds: 6 }],
  paidSearch: [{ kind: 'text' }, { kind: 'text' }],
  affiliates: [{ kind: 'link' }],
  podcasts:   [{ kind: 'audio', seconds: 60 }, { kind: 'audio', seconds: 30 }],
};

/**
 * ⚠️ THE ADVERTISER IS NOT GROWTH.
 *
 * Growth is the analytics platform. The campaigns inside it belong to the
 * CUSTOMER whose ad accounts are connected -- so the creative in this section
 * is that customer's, and it should look nothing like this product.
 *
 * The first version of this file got it backwards and wrote SaaS copy: "One
 * dashboard for Meta, TikTok, YouTube and search", pointed at growth.app. That
 * is Growth advertising itself, inside its own reporting tool, which is not a
 * thing that happens. It is the same defect class as a status reporting what
 * was stored rather than what was true -- content that describes the wrong
 * subject entirely.
 *
 * The advertiser is a consumer money app, and the channel mix is the argument
 * for it: fintech is the heaviest podcast and affiliate advertiser there is,
 * brand-defence search is a line item every fintech actually runs, and the
 * funnel this product reports -- leads, CAC, ROAS -- is exactly how a signup
 * business measures itself. "Tax Season — Prospecting", "Interest — First-time
 * filers", "Comparison sites" and "Business & finance shows" all read as
 * themselves rather than as dressing.
 *
 * One constant, so renaming the fictional advertiser is a one-line change.
 */
export const ADVERTISER = { name: 'Northbank', domain: 'northbank.app' };

/* Copy fragments, picked deterministically rather than randomly -- the same
   campaign must render the same ads on every visit, and Math.random in a data
   layer means a screenshot cannot be reproduced. */
const HOOKS: Record<string, string[]> = {
  Conversions: ['Set up in under three minutes', 'Start free, no card', 'Join 400,000 people'],
  Traffic:     ['See your spending in two minutes', 'Link an account, see the truth', 'For people who hate budgeting'],
  Awareness:   ['Know where the money went', 'Every account, one place', 'The last money app you will try'],
  Sales:       ['Premium is $4 a month', 'Lock in the annual price', 'Two months free on annual'],
  Retention:   ['Your December summary is ready', 'You have not checked in since October', 'Pick your budget back up'],
};

const CTAS = ['Get started', 'Download free', 'Link an account', 'See my spending'];

function hooksFor(objective: string): string[] {
  return HOOKS[objective] ?? HOOKS.Conversions;
}

/* Deterministic, stable and cheap. Not a hash function -- it only has to spread
   a handful of indices without collapsing to one. */
function seed(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) n = (n * 31 + s.charCodeAt(i)) % 9973;
  return n;
}

function forAdSet(c: Campaign, a: AdSet): Creative[] {
  const formats = FORMATS[c.channel];
  const hooks = hooksFor(c.objective);
  const base = seed(a.id);

  /* Shares built to sum to exactly one, so the ads under an ad set add up to
     the ad set -- the same rule the campaign series uses against its channel.
     A creative table that does not reconcile with the row above it is worse
     than no creative table. */
  const weights = formats.map((_, i) => 1 + ((base + i * 7) % 5));
  const total = weights.reduce((x, y) => x + y, 0);

  return formats.map((f, i) => {
    const share = weights[i] / total;
    const headline = hooks[(base + i) % hooks.length];
    return {
      id: `${a.id}-cr${i + 1}`,
      adSetId: a.id,
      adSetName: a.name,
      kind: f.kind,
      ratio: f.ratio,
      seconds: f.seconds,
      headline,
      body: bodyFor(c, f.kind, i),
      cta: f.kind === 'text' || f.kind === 'link' ? undefined : CTAS[(base + i) % CTAS.length],
      /* The ADVERTISER's domain, not this product's. A search ad in a
         customer's account that displays growth.app is showing the reporting
         tool's URL to the customer's shoppers. */
      destination: f.kind === 'text' ? `${ADVERTISER.domain}/signup`
        : f.kind === 'link' ? `partner.link/${ADVERTISER.domain}/${i + 1}` : undefined,
      /* Looked up by SHAPE from the asset library, cycling by index so three
         ad sets running the same format do not show the same picture three
         times. Undefined when that shape has no file yet, and the card renders
         a labelled placeholder rather than substituting something -- a missing
         asset should look missing.

         Video resolves against the library too: a video slot wants a POSTER
         FRAME, which is a still, and is exactly what Ads Manager shows in a
         list view. */
      src: f.ratio ? assetFor(f.ratio, i + seed(a.id)) : undefined,
      focus: f.ratio ? FOCUS[f.ratio] : undefined,
      /* An ad in a paused ad set is not running, whatever its own status says.
         Reporting it as Active would be a status describing what was stored
         rather than what is true. */
      stage: a.stage === 'Paused' ? 'Paused' : (i === formats.length - 1 && formats.length > 2 ? 'Paused' : 'Active'),
      spend: Math.round(a.spend * share),
      leads: Math.round(a.leads * share),
    };
  });
}

function bodyFor(c: Campaign, kind: CreativeKind, i: number): string {
  if (kind === 'text') {
    return i === 0
      ? 'Track spending, bills and savings in one app. Free to start, no card.'
      : 'Link every account and see where it actually goes. Setup takes minutes.';
  }
  if (kind === 'audio') {
    return i === 0
      ? `Host read — 60s mid-roll. Opens on the where-did-it-go story, then the ${ADVERTISER.name} code.`
      : 'Host read — 30s pre-roll. Offer code only, no narrative setup.';
  }
  if (kind === 'link') return `Placement on ${c.name.split(' — ')[0]} partner pages, above the fold.`;
  return 'Cold audience cut. App on screen within the first two seconds.';
}

/* ---- A real account's ads (Phase 4) ----------------------------------

   When a source supplies ads, they REPLACE the generator entirely. Without
   this switch the generator would fill a real account's ad sets with the
   demo's invented headlines -- fake ads inside real ad sets, the worst kind of
   wrong because it looks exactly like data. */
let SOURCE_ADS: Map<string, Creative[]> | null = null;
let SOURCE_AD_ROWS: Map<string, DayRow[]> | null = null;

export function setSourceAds(ads: Map<string, Creative[]> | null, rows: Map<string, DayRow[]> | null): void {
  SOURCE_ADS = ads;
  SOURCE_AD_ROWS = rows;
}

/** True when this ad's days came from a real account, not the seed's shares. */
export function hasRealRows(id: string): boolean {
  return Boolean(SOURCE_AD_ROWS?.has(id));
}

/** Every ad running in a campaign, grouped under the ad set that owns it. */
export function creativesFor(campaignId: string): Creative[] {
  if (SOURCE_ADS) return SOURCE_ADS.get(campaignId) ?? [];
  const c = CAMPAIGNS.find((x) => x.id === campaignId);
  if (!c) return [];
  return c.adSets.flatMap((a) => forAdSet(c, a));
}

/**
 * What this channel's assets are called, so the section header is not "Assets".
 *
 * Derived from CHANNEL_DEPTH rather than restated. It used to be its own table
 * with the same six answers in it, which is one rule written twice -- and the
 * copy that is not the source is the one that goes stale. Renaming a tier now
 * happens in exactly one file.
 */
export const CREATIVE_NOUN: Record<ChannelName, string> = Object.fromEntries(
  (Object.keys(CHANNEL_DEPTH) as ChannelName[]).map((k) => [k, CHANNEL_DEPTH[k].leaf.many]),
) as Record<ChannelName, string>;

export type CreativeSort = 'Leads' | 'Spend' | 'CAC';
export const CREATIVE_SORTS: CreativeSort[] = ['Leads', 'Spend', 'CAC'];

/* Lower is better for CAC, and only for CAC among these three. Same rule the
   KPI cards use -- getting it wrong here ranks the most expensive ad first and
   labels it "top", which is the CAC inversion again in a new costume. */
/* 🐛 Scored on `creativeTotals`, NOT on the seed's `c.spend` / `c.leads`.

   The seed figures split a campaign's leads by SPEND share; `creativeTotals`
   splits them by the wobbled LEAD share (G-013), which is what every other
   screen reads. Ranking and displaying the seed made one ad two different
   ads: "Join 400,000 people" was 302 leads at $32.85 on the campaign page and
   196 leads at $50.61 on its own page and the Ads screen -- and #1 here was not
   #1 there. It also could not follow the date picker. One source now. */
type TotalsOf = (c: Creative) => { spend: number; leads: number };

function score(c: Creative, sort: CreativeSort, totalsOf: TotalsOf): number {
  const t = totalsOf(c);
  if (sort === 'Spend') return t.spend;
  if (sort === 'Leads') return t.leads;
  /* An ad with no leads has no cost per lead. Infinity sorts it last on CAC
     rather than dividing by zero into NaN, which sorts unpredictably. */
  return t.leads > 0 ? t.spend / t.leads : Number.POSITIVE_INFINITY;
}

/** Ranked best-first for the chosen measure. Pure, so it is testable. */
export function rankCreatives(
  list: Creative[], sort: CreativeSort, range: Range = 30,
  /* Injectable for unit tests of the ORDERING rules, which use fixture ads
     that are not in the account. The app always takes the default. */
  totalsOf: TotalsOf = (c) => creativeTotals(c.id, range),
): Creative[] {
  const dir = sort === 'CAC' ? 1 : -1;
  return [...list].sort((a, b) => {
    const d = (score(a, sort, totalsOf) - score(b, sort, totalsOf)) * dir;
    /* A TOTAL order. Without the tie-breaks the same data can render in a
       different sequence between renders, which reads as the list shuffling
       on its own. */
    return d !== 0 ? d : (totalsOf(b).spend - totalsOf(a).spend) || a.id.localeCompare(b.id);
  });
}

/* ---------------------------------------------------------------- one ad -- */

export function creativeById(id: string): { creative: Creative; campaignId: string } | undefined {
  for (const c of CAMPAIGNS) {
    const found = creativesFor(c.id).find((x) => x.id === id);
    if (found) return { creative: found, campaignId: c.id };
  }
  return undefined;
}

/**
 * An ad's share of its campaign — a constant that sums to one across the
 * campaign's ads.
 *
 * Constant by design, the same trick campaignSeries uses against its channel:
 * it makes every ad's daily numbers reconcile with the campaign's by
 * construction rather than by a rounding pass afterwards.
 */
export function creativeShare(id: string): number {
  const owner = creativeById(id);
  if (!owner) return 0;
  const all = creativesFor(owner.campaignId);
  const total = all.reduce((a, c) => a + c.spend, 0);
  return total > 0 ? owner.creative.spend / total : 0;
}

/**
 * An ad's share of its campaign's LEADS — wobbled, and composed THROUGH its ad set.
 *
 * 🚨 G-013, the ad tier. Ads used one share for the whole funnel, so every ad in
 * a campaign had an identical CAC.
 *
 * ⭐ The composition is the careful part. The wobble is applied WITHIN the ad set
 * and renormalised there, then multiplied by the ad set's own lead share of the
 * campaign. So:
 *
 *   - ads sum to their ad set, exactly
 *   - ad sets sum to their campaign, exactly
 *   - therefore ads sum to their campaign, exactly
 *
 * Wobbling ads directly against the campaign would have broken the middle link:
 * the ads would still add up to the campaign while disagreeing with the ad-set
 * row printed directly above them, which is the worst of the three options
 * because it is the one nothing on screen admits to.
 */
export function creativeLeadShare(id: string): number {
  const owner = creativeById(id);
  if (!owner) return 0;
  const found = creativesFor(owner.campaignId).find((x) => x.id === id);
  if (!found) return 0;

  /* Siblings inside the same ad set -- the group the wobble is normalised over. */
  const sibs = creativesFor(owner.campaignId).filter((x) => x.adSetId === found.adSetId);
  const spendTotal = sibs.reduce((a, x) => a + x.spend, 0);
  if (spendTotal <= 0) return 0;

  /* AD_SPREAD, not the ad-set default -- creative varies far more than audience. */
  const weights = sibs.map((x) => (x.spend / spendTotal) * adSetWobble(x.id, AD_SPREAD));
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const i = sibs.findIndex((x) => x.id === id);

  /* Its slice of the ad set, times the ad set's slice of the campaign. */
  return (weights[i] / sum) * adSetLeadShare(found.adSetId);
}

/** Daily rows for one ad, scaled out of its campaign's. Follows the range. */
export function creativeRows(id: string, range: Range = 30, back = 0, shift = 0): DayRow[] {
  const real = SOURCE_AD_ROWS?.get(id);
  if (real) return sliceWindow(real, range, back, shift);
  const owner = creativeById(id);
  if (!owner) return [];
  /* Bought on spend, returns on leads. The gap between the two shares IS the
     ad's efficiency -- and the only reason two ads in one campaign can now have
     different CACs. */
  const share = creativeShare(id);
  const leadShare = creativeLeadShare(id);
  return campaignRows(owner.campaignId, range, back, shift).map((r) => ({
    ...r,
    spend: r.spend * share,
    impressions: r.impressions * share,
    clicks: r.clicks * share,
    leads: r.leads * leadShare,
    sales: r.sales * leadShare,
    revenue: r.revenue * leadShare,
  }));
}

export function creativeTotals(id: string, range: Range = 30) {
  const sum = creativeRows(id, range).reduce(
    (a, r) => ({
      spend: a.spend + r.spend, impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks, leads: a.leads + r.leads,
      sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
  );
  return {
    ...sum,
    cac: sum.leads > 0 ? sum.spend / sum.leads : 0,
    roas: sum.spend > 0 ? sum.revenue / sum.spend : 0,
  };
}

/** Series for the ad chart, in the shape Chart expects. */
export function creativeSeries(id: string, metric: Metric, range: Range = 30) {
  /* 🐛 This scaled the CAMPAIGN's series by the ad's SPEND share -- wrong three
     ways: a ratio (CAC, ROAS) does not scale by a share; leads follow the LEAD
     share, not spend; and a real account's ad has its own rows, which were
     ignored. The chart's 30-day leads summed to 291 while the ad's own total
     said 196, and a real ad with zero leads was drawn at one a day.
     Built from the ad's own rows now -- the same rows its totals sum. */
  const owner = creativeById(id);
  if (!owner) return [];
  const labels = campaignSeries(owner.campaignId, metric, range).map((p) => p.label);
  return creativeRows(id, range).map((r, i) => {
    let value: number;
    switch (metric) {
      case 'Spend':  value = r.spend; break;
      case 'Clicks': value = r.clicks; break;
      case 'Leads':  value = r.leads; break;
      case 'Sales':  value = r.sales; break;
      case 'CAC':    value = r.leads > 0 ? r.spend / r.leads : 0; break;
      case 'ROAS':   value = r.spend > 0 ? r.revenue / r.spend : 0; break;
    }
    return { label: labels[i] ?? '', value };
  });
}
