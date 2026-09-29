import type { ChannelName } from '../styles/tokens';
import { CHANNEL_METRICS, valueOf, type DerivedMetric } from './channelMetrics';
import {
  CHANNEL_KEYS, CHANNEL_LABEL, activeChannels, changeOf, rowsFor, sampleOf,
  type DayRow, type Range,
} from './metrics';

/**
 * Blending metrics across channels that do not all report them.
 *
 * 🚨 The problem, and it is a real one rather than a missing feature.
 *
 * Overview and the channel screens showed FOUR metrics -- Spend, Leads, CAC,
 * ROAS. A campaign page shows up to nine, an ad-set page the same, an ad page
 * the same. **So the vocabulary got RICHER the deeper you drilled**, and the
 * screen whose whole job is "all the channel traffic" was the thinnest one in
 * the product. That is backwards.
 *
 * ⚠️ The reason it was never just widened: **you cannot blend a rate across
 * channels that do not all have its denominator.** Podcasts report no clicks --
 * an audio ad has none. Affiliates report no impressions; they are paid on
 * performance and impressions are neither bought nor reported. So:
 *
 *   - **Blended CTR** over all six channels would divide clicks that only five
 *     channels produced by impressions that only four channels have.
 *   - **Blended CPC** as (all spend) / (all clicks) is worse, because it is
 *     quietly wrong rather than obviously missing: podcast spend sits in the
 *     numerator having produced no clicks at all, so the blended cost per click
 *     comes out HIGHER than any real channel's. A reader cannot tell from
 *     looking, and every channel row on the same screen would contradict it.
 *
 * ⭐ THE RULE: a blended metric is computed **only over the channels that can
 * report it**, and the card says which. One line of arithmetic and one line of
 * words, and the number becomes checkable.
 *
 * The elegant part is that it takes ONE implementation for both kinds. Combine
 * only the covering channels' daily funnels into a single DayRow per day, then
 * hand that to `valueOf` -- the same function every other tier uses. For a count
 * that yields the sum, which is the true account total. For a rate it yields a
 * ratio whose numerator and denominator come from the same set of channels.
 * Counts and rates need no special-casing because the scoping happens before the
 * arithmetic rather than inside it.
 */

/** Which of the given channels can honestly report this metric. */
export function coverageFor(m: DerivedMetric, channels: ChannelName[]): ChannelName[] {
  return channels.filter((c) => CHANNEL_METRICS[c].includes(m));
}

/**
 * The blended vocabulary: every metric at least one active channel reports,
 * in a stable reporting order.
 *
 * Order is taken from the union in a fixed sequence rather than from whichever
 * channel happened to be first -- otherwise switching a channel off in Settings
 * would reshuffle the Overview cards, and a dashboard whose cards move when you
 * change an unrelated setting is one nobody trusts.
 */
const BLEND_ORDER: DerivedMetric[] = [
  'Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'CPM',
  'Leads', 'CVR', 'CAC', 'ROAS', 'Sales',
];

export function blendedMetrics(channels: ChannelName[] = activeChannels()): DerivedMetric[] {
  return BLEND_ORDER.filter((m) => coverageFor(m, channels).length > 0);
}

/**
 * One combined funnel row per day, over the covering channels only.
 *
 * ⚠️ Summed BEFORE any ratio is taken. Averaging each channel's CAC would weight
 * a $900 channel the same as a $90,000 one; summing the funnel first makes the
 * blend spend-weighted, which is what "blended CAC" means everywhere else in
 * this industry.
 */
function combinedRows(channels: ChannelName[], range: Range, back = 0): DayRow[] {
  if (channels.length === 0) return [];
  const per = channels.map((c) => rowsFor(c, range, back));
  const days = per[0].length;
  return Array.from({ length: days }, (_, d) =>
    per.reduce<DayRow>((a, rows) => ({
      spend: a.spend + rows[d].spend,
      impressions: a.impressions + rows[d].impressions,
      clicks: a.clicks + rows[d].clicks,
      leads: a.leads + rows[d].leads,
      sales: a.sales + rows[d].sales,
      revenue: a.revenue + rows[d].revenue,
    }), { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 }),
  );
}

/** Daily blended values, scoped to the channels that report the metric. */
export function blendedValues(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(), range: Range = 30,
): number[] {
  return combinedRows(coverageFor(m, channels), range).map((r) => valueOf(m, r));
}

/**
 * The period figure — parts summed across days, then the ratio taken ONCE.
 *
 * Not the mean of `blendedValues`. A period's CTR is total clicks over total
 * impressions, not the average of each day's CTR, and the two are different
 * numbers. Same rule every other tier in this codebase follows.
 */
export function blendedTotal(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(), range: Range = 30,
): number {
  const rows = combinedRows(coverageFor(m, channels), range);
  const sum = rows.reduce<DayRow>((a, r) => ({
    spend: a.spend + r.spend, impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks, leads: a.leads + r.leads,
    sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });
  return valueOf(m, sum);
}

export function blendedDelta(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(), range: Range = 30,
): number {
  const cover = coverageFor(m, channels);
  return changeOf(m, combinedRows(cover, range), combinedRows(cover, range, 1));
}

export function blendedSparkline(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(), range: Range = 30, points = 7,
): number[] {
  return sampleOf(blendedValues(m, channels, range), points);
}

/**
 * What the number is computed over — only when that is a CAVEAT.
 *
 * 🔄 Settled after two passes, and the middle one was wrong.
 *
 * It started as null-when-complete: a note nobody needs is noise, and noise
 * crowds out the note that matters. That produced a ragged row — three cards
 * carried a line, one did not, and `.gr-kpi` uses `min-height`, so the flex row
 * stretched the short one and left dead space.
 *
 * The fix attempt made every card state coverage, complete ones affirming "6 of
 * 6 channels". It solved the geometry and lost the argument: "6 of 6" is four
 * words that tell a reader nothing they would act on, printed on every card
 * forever to keep one card from looking short.
 *
 * ⭐ Geometry is a LAYOUT problem and belongs in the layout. The note is back to
 * appearing only when there is something to say; the card reserves the slot so
 * presence or absence cannot change its height. Uniform rows, no invented text.
 *
 * ⚠️ Null for a single channel too — that is not a blend, so there is nothing for
 * it to be partial about.
 */
export function coverageNote(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(),
): string | null {
  const covering = coverageFor(m, channels);
  if (covering.length === 0) return null;
  if (channels.length < 2) return null;
  if (covering.length === channels.length) return null;
  return `${covering.length} of ${channels.length} channels`;
}

/**
 * The same fact, unabbreviated, for the title attribute and assistive tech.
 *
 * The short note is cut to fit a 233px card. **The meaning must not be** -- "4 of
 * 6 channels" tells a reader something is excluded without telling them what,
 * which is halfway to useless on its own. Naming the channels is the part that
 * makes the figure checkable.
 */
export function coverageTitle(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(),
): string | undefined {
  const covering = coverageFor(m, channels);
  if (covering.length === 0 || channels.length < 2) return undefined;
  if (covering.length === channels.length) return undefined;
  const names = (list: ChannelName[]) => list.map((c) => CHANNEL_LABEL[c]).join(', ');
  const missing = channels.filter((c) => !covering.includes(c));
  return `${m} covers ${names(covering)}. Excluded: ${names(missing)} — `
    + `${missing.length === 1 ? 'it does' : 'they do'} not report ${m}.`;
}

/** Every channel, for tests and for the Settings empty case. */
export const ALL_CHANNELS: ChannelName[] = [...CHANNEL_KEYS];

/**
 * One channel's change on ANY metric, or null when the channel cannot report it.
 *
 * Null, not 0: a podcast has no clicks, so its "change in clicks" is not zero
 * percent -- it is not a number at all, and a table that printed "0%" would be
 * asserting that nothing moved in a thing that does not exist.
 */
export function channelChange(ch: ChannelName, m: DerivedMetric, range: Range = 30): number | null {
  if (coverageFor(m, [ch]).length === 0) return null;
  return changeOf(m, rowsFor(ch, range), rowsFor(ch, range, 1));
}
