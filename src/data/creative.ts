import type { ChannelName } from '../styles/tokens';
import type { Stage } from '../components/StatusPill/StatusPill';
import { CAMPAIGNS, type AdSet, type Campaign } from './campaigns';
import adAsset from '../assets/creative/ad.jpg';

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
 * The seed data already said who the advertiser is and nobody read it:
 * "Back to School", "Interest — Parents", "Interest — Educators",
 * "Bundle — Starter", "Coupon & deals", "TikTok Shop — Bundle Drop". That is a
 * direct-to-consumer brand selling to families and classrooms.
 *
 * One constant, so renaming the fictional advertiser is a one-line change.
 */
export const ADVERTISER = { name: 'Foxglove Supply', domain: 'foxglove.co' };

/* Copy fragments, picked deterministically rather than randomly -- the same
   campaign must render the same ads on every visit, and Math.random in a data
   layer means a screenshot cannot be reproduced. */
const HOOKS: Record<string, string[]> = {
  Conversions: ['The starter kit, 20% off', 'Everything for one desk, in one box', 'Free shipping over $40'],
  Traffic:     ['See the autumn range', 'Classroom packs are back', 'Built to survive a backpack'],
  Awareness:   ['Made for hands that press hard', 'Paper worth ruining', 'Supplies that outlast the term'],
  Sales:       ['Restock before term starts', 'Bundle and save $18', 'Last week for back-to-school pricing'],
  Retention:   ['Your refill is due', 'Reorder the kit you loved', 'Same box, restocked'],
};

const CTAS = ['Shop now', 'Shop the range', 'Get the bundle', 'Order today'];

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
      destination: f.kind === 'text' ? `${ADVERTISER.domain}/bundles`
        : f.kind === 'link' ? `partner.link/${ADVERTISER.domain}/${i + 1}` : undefined,
      /* Stills only. A video's frame carries a duration instead -- inventing a
         thumbnail for a film nobody shot is the thing this file will not do. */
      src: f.kind === 'image' ? adAsset : undefined,
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
      ? 'Sketchbooks, pens and classroom packs. Free shipping over $40.'
      : 'Starter bundles from $29. Restock pricing ends Sunday.';
  }
  if (kind === 'audio') {
    return i === 0
      ? `Host read — 60s mid-roll. Opens on the desk-clutter story, then the ${ADVERTISER.name} code.`
      : 'Host read — 30s pre-roll. Offer code only, no narrative setup.';
  }
  if (kind === 'link') return `Placement on ${c.name.split(' — ')[0]} partner pages, above the fold.`;
  return 'Cold audience cut. Product in hand within the first two seconds.';
}

/** Every ad running in a campaign, grouped under the ad set that owns it. */
export function creativesFor(campaignId: string): Creative[] {
  const c = CAMPAIGNS.find((x) => x.id === campaignId);
  if (!c) return [];
  return c.adSets.flatMap((a) => forAdSet(c, a));
}

/** What this channel's assets are called, so the section header is not "Assets". */
export const CREATIVE_NOUN: Record<ChannelName, string> = {
  meta: 'Ads', tiktok: 'Ads', youtube: 'Video ads',
  paidSearch: 'Text ads', affiliates: 'Placements', podcasts: 'Spots',
};

export type CreativeSort = 'Leads' | 'Spend' | 'CAC';
export const CREATIVE_SORTS: CreativeSort[] = ['Leads', 'Spend', 'CAC'];

/* Lower is better for CAC, and only for CAC among these three. Same rule the
   KPI cards use -- getting it wrong here ranks the most expensive ad first and
   labels it "top", which is the CAC inversion again in a new costume. */
function score(c: Creative, sort: CreativeSort): number {
  if (sort === 'Spend') return c.spend;
  if (sort === 'Leads') return c.leads;
  /* An ad with no leads has no cost per lead. Infinity sorts it last on CAC
     rather than dividing by zero into NaN, which sorts unpredictably. */
  return c.leads > 0 ? c.spend / c.leads : Number.POSITIVE_INFINITY;
}

/** Ranked best-first for the chosen measure. Pure, so it is testable. */
export function rankCreatives(list: Creative[], sort: CreativeSort): Creative[] {
  const dir = sort === 'CAC' ? 1 : -1;
  return [...list].sort((a, b) => {
    const d = (score(a, sort) - score(b, sort)) * dir;
    /* A TOTAL order. Without the tie-breaks the same data can render in a
       different sequence between renders, which reads as the list shuffling
       on its own. */
    return d !== 0 ? d : (b.spend - a.spend) || a.id.localeCompare(b.id);
  });
}
