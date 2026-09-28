import type { ChannelName } from '../styles/tokens';

/**
 * How deep a channel goes, and what it calls each level.
 *
 * ⭐ The product had ONE vocabulary -- campaign, ad set, ad -- and used it for
 * all six channels. That is Meta's dialect, spoken to everybody. A Google Ads
 * buyer has never shipped an "ad set" in their life; they build AD GROUPS. An
 * affiliate manager has PARTNERS. A podcast buyer buys a SHOW and gets a SPOT.
 *
 * It is the same defect class this file's sibling already fixed for metrics.
 * `CHANNEL_METRICS` stopped printing a CTR for an audio ad because a podcast has
 * no click. This stops calling a podcast's show an ad set, because a podcast has
 * no ad set. In both cases the product was reporting a structure the medium does
 * not have, and in both cases the fix is a table rather than a special case.
 *
 * 🔄 A correction worth recording, because the first version of the audit got it
 * wrong. That audit said Meta, Google and TikTok have four tiers while
 * affiliates and podcasts have two -- so two channels should lose the middle
 * level entirely. Reading the seeded data killed that idea: every channel here
 * DOES group its ads one level up, and grouping is exactly what the middle tier
 * is. An affiliate program groups by partner; a podcast buy groups by show.
 *
 * **So the tier count is the same and the NAMES are what differ.** That is a
 * smaller claim than the audit made, and it is the true one. Deleting a real
 * level from two channels to satisfy a tidy theory would have been worse than
 * the bug it was meant to fix.
 */

export interface TierNames {
  /** "Ad set" -- for a heading about one of them. */
  one: string;
  /** "Ad sets" -- for a section header and a count. */
  many: string;
}

export interface ChannelDepth {
  /** The middle tier: what a campaign contains. */
  group: TierNames;
  /** The leaf: what the middle tier contains. */
  leaf: TierNames;
}

export const CHANNEL_DEPTH: Record<ChannelName, ChannelDepth> = {
  meta: {
    group: { one: 'Ad set', many: 'Ad sets' },
    leaf: { one: 'Ad', many: 'Ads' },
  },
  tiktok: {
    /* TikTok's Business Center says Ad Group, not Ad Set, even though the
       buying model is closest to Meta's. Following the platform, not the
       resemblance. */
    group: { one: 'Ad group', many: 'Ad groups' },
    leaf: { one: 'Ad', many: 'Ads' },
  },
  youtube: {
    group: { one: 'Ad group', many: 'Ad groups' },
    leaf: { one: 'Video ad', many: 'Video ads' },
  },
  paidSearch: {
    group: { one: 'Ad group', many: 'Ad groups' },
    leaf: { one: 'Text ad', many: 'Text ads' },
  },
  affiliates: {
    /* A partner is not a targeting bundle -- it is a company you have a deal
       with. It sits at the same level structurally and means something else
       entirely, which is the whole reason it needs its own word. */
    group: { one: 'Partner', many: 'Partners' },
    leaf: { one: 'Placement', many: 'Placements' },
  },
  podcasts: {
    group: { one: 'Show', many: 'Shows' },
    leaf: { one: 'Spot', many: 'Spots' },
  },
};

/** What a campaign's children are called on this channel. */
export function groupNoun(channel: ChannelName): TierNames {
  return CHANNEL_DEPTH[channel].group;
}

/** What the individual running things are called on this channel. */
export function leafNoun(channel: ChannelName): TierNames {
  return CHANNEL_DEPTH[channel].leaf;
}
