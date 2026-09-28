import type { ChannelName } from '../styles/tokens';
import { CHANNEL_METRICS, valueOf, type DerivedMetric } from './channelMetrics';
import {
  CHANNEL_KEYS, CHANNEL_LABEL, activeChannels, deltaOf, rowsFor, sampleOf,
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
function combinedRows(channels: ChannelName[], range: Range): DayRow[] {
  if (channels.length === 0) return [];
  const per = channels.map((c) => rowsFor(c, range));
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
  return deltaOf(blendedValues(m, channels, range));
}

export function blendedSparkline(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(), range: Range = 30, points = 7,
): number[] {
  return sampleOf(blendedValues(m, channels, range), points);
}

/**
 * What the number is computed over, in words.
 *
 * 🔄 REVERSED. This used to return null on a complete blend, reasoning that a
 * note nobody needs is noise and noise crowds out the note that matters. Sound
 * in the abstract, and it produced a visible defect: a KPI row where three cards
 * carried a line and one did not, so the card WITHOUT the caveat grew a patch of
 * dead space when the flex row stretched everything to the tallest. Tommy spotted
 * it immediately — "it kind of messes up the other cards that aren't filled in".
 *
 * ⭐ The fix is not an EMPTY reserved line, which is the obvious move and leaves
 * the same hole. Every blended card states its coverage, and a complete one says
 * so positively: "6 of 6 channels". That fills the space with information rather
 * than padding, and it turns completeness into something the card ASSERTS instead
 * of something the reader has to infer from an absence.
 *
 * ⚠️ Null for a single channel, because that is not a blend — there is nothing
 * for it to be partial about, and a channel screen's row is uniform without it.
 * The rule is uniformity WITHIN a row, not globally: every card on Overview has
 * the line, no card on a channel screen does.
 *
 * Chart fixed this same defect once already: "One legend, always present… it
 * used to appear only on compare, which made the whole card grow ~20px taller
 * the moment Compare was switched on."
 */
export function coverageNote(
  m: DerivedMetric, channels: ChannelName[] = activeChannels(),
): string | null {
  const covering = coverageFor(m, channels);
  if (covering.length === 0) return null;
  if (channels.length < 2) return null;
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
  const names = (list: ChannelName[]) => list.map((c) => CHANNEL_LABEL[c]).join(', ');
  /* The complete case gets a sentence too, not silence. "All six" is a claim
     worth making explicitly on a dashboard whose whole argument is that it says
     what it can and cannot see. */
  if (covering.length === channels.length) {
    return `${m} covers all ${channels.length} channels you run: ${names(covering)}.`;
  }
  const missing = channels.filter((c) => !covering.includes(c));
  return `${m} covers ${names(covering)}. Excluded: ${names(missing)} — `
    + `${missing.length === 1 ? 'it does' : 'they do'} not report ${m}.`;
}

/** Every channel, for tests and for the Settings empty case. */
export const ALL_CHANNELS: ChannelName[] = [...CHANNEL_KEYS];
