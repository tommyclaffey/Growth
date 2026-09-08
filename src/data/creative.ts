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

/* Copy fragments, picked deterministically rather than randomly -- the same
   campaign must render the same ads on every visit, and Math.random in a data
   layer means a screenshot cannot be reproduced. */
const HOOKS: Record<string, string[]> = {
  Conversions: ['Built for the way you actually work', 'Stop paying for seats you never use', 'Switch in an afternoon'],
  Traffic:     ['See what your team has been missing', 'The dashboard your CFO asks for', 'Ten minutes to your first report'],
  Awareness:   ['Every channel. One number.', 'Marketing spend, finally legible', 'Where did the budget actually go?'],
  Retention:   ['You are three clicks from renewing', 'Your best month is still open', 'Keep the reporting you built'],
};

const CTAS = ['Get started', 'Learn more', 'Book a demo', 'Start free trial'];

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
      destination: f.kind === 'text' ? 'growth.app/reporting'
        : f.kind === 'link' ? `partner.link/${c.channel}/${i + 1}` : undefined,
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
      ? 'One dashboard for Meta, TikTok, YouTube and search. Free 14-day trial.'
      : 'Blended CAC, per-channel ROAS and pacing in one view. No spreadsheet.';
  }
  if (kind === 'audio') {
    return i === 0
      ? 'Host read — 60s mid-roll. Opens on the "which channel actually worked" question, then the offer code.'
      : 'Host read — 30s pre-roll. Offer code only, no narrative setup.';
  }
  if (kind === 'link') return `Placement on ${c.name.split(' — ')[0]} partner pages, above the fold.`;
  return 'Cold audience cut. Product UI on screen for the first two seconds.';
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
