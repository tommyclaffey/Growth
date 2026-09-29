/* ============================================================
   Growth — the data layer.

   The metric toggle used to be decorative: six buttons that changed a label
   and nothing else. This module is what makes it real.

   The important decision here is that CAC and ROAS are NOT stored series.
   They are ratios derived from the funnel, recomputed whenever the selection
   changes. Storing them as their own arrays would let them drift out of
   agreement with spend and leads, which is exactly the class of bug the
   token refactor taught me to design out rather than test for.
   ============================================================ */

import type { ChannelName } from '../styles/tokens';
import { reportable, valueOf, type DerivedMetric } from './channelMetrics';

export type Metric = 'Spend' | 'Clicks' | 'Leads' | 'Sales' | 'CAC' | 'ROAS';
export const METRICS: Metric[] = ['Spend', 'Clicks', 'Leads', 'Sales', 'CAC', 'ROAS'];

/* 90 days to select from, plus HISTORY (below) before them for comparison.
   The 30-day window is the last 30 of them, normalised to the design's totals —
   so "Last 30 days" still reads $160,780 exactly, while 7 and 90 day are
   honestly derived rather than faked. */
export const POINTS = 90;
/* The 90 days BEFORE the longest window. "Δ Prev" compares a window with the one
   immediately preceding it, and for the 90-day range that needs 90 earlier days
   to exist. They are never displayed as a window of their own -- they are only
   ever the comparison. */
export const HISTORY = 90;
/* ⭐ Two years (Sept 29): year-over-year needs last year's same days to exist.
   The most recent 180 (HISTORY + POINTS) are generated EXACTLY as before --
   every published figure is unchanged -- and ARCHIVE older days are prepended
   from their own generators. See generateSeeded. */
const RECENT = HISTORY + POINTS;
export const TOTAL_POINTS = 730;
const ARCHIVE = TOTAL_POINTS - RECENT;
export const DAYS = 30;

/**
 * A window of whole days ending on the last day of data.
 *
 * ⭐ Phase 3: any 1–90, not just the three presets. The ceiling is not
 * arbitrary -- every change figure compares the window with the SAME number of
 * days before it, and the history holds 180, so 90 is the longest window that
 * still has a full window to compare against.
 */
export type Range = number;
/* A year: the longest window that still has a full window before it in two
   years of history. */
export const MAX_RANGE = 365;
export const RANGES: Range[] = [7, 30, 90];

/** A whole number of days the product can show and compare. */
export function isRange(n: unknown): n is Range {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= MAX_RANGE;
}

/** A preset's own name, whatever window is showing: "Last 30 days". */
export function lastLabel(r: Range): string {
  return r === 1 ? 'Last day' : `Last ${r} days`;
}

/** "Last 30 days" -- or, for custom dates, the dates themselves. */
export function rangeLabel(r: Range): string {
  if (WINDOW_END > 0) {
    const [a, b] = windowDates(r);
    return a === b ? a : `${a} – ${b}`;
  }
  return lastLabel(r);
}

/** Mid-sentence: "last 30 days", or "Jul 1, 2026 – Jul 31, 2026" (months keep their capitals). */
export function rangePhrase(r: Range): string {
  return WINDOW_END > 0 ? rangeLabel(r) : lastLabel(r).toLowerCase();
}

/** After "over": "the last 30 days", or "Jul 1, 2026 – Jul 31, 2026". */
export function rangeOver(r: Range): string {
  return WINDOW_END > 0 ? rangeLabel(r) : `the ${lastLabel(r).toLowerCase()}`;
}

/**
 * Per-channel economics.
 *
 * `spend`, `cac`, `roas` and `trend` are taken straight off the Figma screens —
 * they are the numbers a reviewer can see in the design. Everything else in
 * this file is derived from them, and the series is normalised at the end so
 * the totals land on `spend` exactly rather than approximately.
 *
 * That normalisation is the whole point. A dashboard whose header says
 * $160,780 while its own rows add up to $160,593 has already told the reader
 * not to trust it, and nobody can say which of the two numbers is wrong.
 */
const CHANNELS: Record<ChannelName, {
  label: string;
  spend: number;      // 24-day total, from the design
  cvr: number;        // click -> lead
  closeRate: number;  // lead -> sale
  roas: number;
  cac: number;
  trend: number;      // slope of the seeded ramp (second half vs first half of 90 days). NOT the Δ Prev shown on screen -- that compares real windows, see changeOf().
  cpm: number;        // $ per 1,000 impressions — what the media actually costs
}> = {
  meta:       { label: 'Meta',        spend: 61240, cvr: 0.034, closeRate: 0.12, roas: 4.6, cac:  35.94, trend:  0.06, cpm: 12 },
  tiktok:     { label: 'TikTok',      spend: 28110, cvr: 0.021, closeRate: 0.09, roas: 3.9, cac:  33.38, trend: -0.03, cpm: 6 },
  youtube:    { label: 'YouTube',     spend: 22470, cvr: 0.018, closeRate: 0.10, roas: 3.1, cac:  40.05, trend:  0.02, cpm: 4 },
  affiliates: { label: 'Affiliates',  spend: 18320, cvr: 0.052, closeRate: 0.18, roas: 5.2, cac:  36.79, trend:  0.11, cpm: 95 },
  paidSearch: { label: 'Paid Search', spend: 18400, cvr: 0.041, closeRate: 0.15, roas: 3.4, cac:  85.98, trend:  0.04, cpm: 120 },
  podcasts:   { label: 'Podcasts',    spend: 12240, cvr: 0.012, closeRate: 0.07, roas: 2.1, cac: 128.80, trend: -0.01, cpm: 30 },
};

export const CHANNEL_KEYS = Object.keys(CHANNELS) as ChannelName[];
export const CHANNEL_LABEL = Object.fromEntries(
  CHANNEL_KEYS.map((k) => [k, CHANNELS[k].label]),
) as Record<ChannelName, string>;

export type Scope = ChannelName | 'all';

/* Deterministic noise. A seeded PRNG rather than Math.random() so the chart
   does not reshuffle itself on every React render — a moving baseline makes
   the whole dashboard feel untrustworthy. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Day 0 is the oldest. Labels are weekly so the axis stays readable. */
/* One point per day, ending on the LAST DAY OF DATA.

   ⭐ Phase 3: this is the SOURCE's date now, not a constant. The seeded account
   ends on Aug 12, 2026 (so the labels never shift under a reader comparing two
   screenshots); a real ad account ends on its most recent complete day. It
   changes only through `hydrate()`. `export let` is a live binding, so every
   module that imported PERIOD_END or DAY_LABELS reads the current value. */
export const SEEDED_PERIOD_END = '2026-08-12';
export let PERIOD_END = new Date(`${SEEDED_PERIOD_END}T00:00:00Z`);
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function datesEnding(end: Date): Date[] {
  return Array.from({ length: TOTAL_POINTS }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (TOTAL_POINTS - 1 - i));
    return d;
  });
}
const short = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
function labelsEnding(end: Date): string[] {
  return datesEnding(end).map(short);
}
export let DAY_LABELS = labelsEnding(PERIOD_END);
/** ISO dates, one per day, aligned with DAY_LABELS. */
export let DAY_ISO = datesEnding(PERIOD_END).map((d) => d.toISOString().slice(0, 10));

/* ------------------------------------------------------------------ window

   ⭐ WHICH DAYS every screen is looking at -- one definition, used by every
   slice of every series (channel, campaign, ad set, ad, labels).

   A window is `range` days ending WINDOW_END days before the last day of data.
   WINDOW_END is 0 for "Last N days"; custom start/end dates set it. Held here,
   like the active channels, rather than threaded through every call: a caller
   that forgot to pass it would silently report a different window from every
   figure beside it.

   `back` steps whole windows earlier (Δ Prev); `shift` steps a number of DAYS
   earlier (compare to the same days last week / month / year). */
let WINDOW_END = 0;
/* The first index with real data. A real account with 15 months of history is
   padded to TOTAL_POINTS at the front; those padded days are NOT zero spend --
   they are "no data", and a window reaching into them returns nothing. */
let FIRST = 0;

export function windowEnd(): number { return WINDOW_END; }

/** Show `range` days ending `endBack` days before the last day of data. */
export function setWindowEnd(endBack: number) {
  const next = Math.max(0, Math.min(TOTAL_POINTS - 1, Math.floor(endBack) || 0));
  if (next === WINDOW_END) return;
  WINDOW_END = next;
  /* Everything that caches on the data (App's memos, the blend) keys on the
     version -- a different window is different data to them. */
  VERSION += 1;
}

/** [start, end) of the window in an array of `length` days ending on PERIOD_END -- or null if any of it is missing. */
export function windowIndex(length: number, range: Range, back = 0, shift = 0, first = 0): [number, number] | null {
  const end = length - WINDOW_END - shift - back * range;
  const start = end - range;
  return start < first || end > length ? null : [start, end];
}

/** The window's slice of a series. Empty when any of it falls outside the data. */
export function sliceWindow<T>(all: T[], range: Range, back = 0, shift = 0, first = 0): T[] {
  const w = windowIndex(all.length, range, back, shift, first);
  return w ? all.slice(w[0], w[1]) : [];
}

/** Axis labels for the window ("Aug 6"). */
export function windowLabels(range: Range, back = 0, shift = 0): string[] {
  return sliceWindow(DAY_LABELS, range, back, shift);
}

/** First and last day of the window, with the year: ["Jul 1, 2026", "Jul 31, 2026"]. */
export function windowDates(range: Range, back = 0, shift = 0): [string, string] {
  const d = sliceWindow(DAY_ISO, range, back, shift);
  const f = (iso?: string) => {
    if (!iso) return '';
    const x = new Date(`${iso}T00:00:00Z`);
    return `${short(x)}, ${x.getUTCFullYear()}`;
  };
  return [f(d[0]), f(d[d.length - 1])];
}

/** Does the data reach far enough back for this window? */
export function hasWindow(range: Range, back = 0, shift = 0): boolean {
  return windowIndex(TOTAL_POINTS, range, back, shift, FIRST) !== null;
}

/** The first and last dates the account has data for (ISO). */
export function dataSpan(): [string, string] {
  return [DAY_ISO[FIRST], DAY_ISO[DAY_ISO.length - 1]];
}

/** Start/end dates -> the product's window (length + how far back it ends). Null if invalid. */
export function windowFromDates(start: string, end: string): { range: Range; endBack: number } | null {
  const i = DAY_ISO.indexOf(start);
  const j = DAY_ISO.indexOf(end);
  const [first] = dataSpan();
  if (i < 0 || j < 0 || i > j || start < first) return null;
  const range = j - i + 1;
  if (!isRange(range)) return null;
  return { range, endBack: DAY_ISO.length - 1 - j };
}

/**
 * How many days before the current window's end the comparison window ends.
 * Week: 7. Month and year: calendar -- the same dates one month / one year
 * earlier, so "Aug 1–12" compares with "Jul 1–12", not with 30 days ago.
 */
export type ComparePeriod = 'week' | 'month' | 'year';
export function compareShift(p: ComparePeriod): number {
  if (p === 'week') return 7;
  const endIso = DAY_ISO[DAY_ISO.length - 1 - WINDOW_END];
  const end = new Date(`${endIso}T00:00:00Z`);
  /* 🐛 setUTCMonth(m - 1) ROLLS OVER when the earlier month is shorter: Mar 31
     became "Feb 31" = Mar 3, so "last month" for Mar 1-31 compared against
     Feb 1 - Mar 3 -- overlapping the window itself. Clamped to the earlier
     month's last day (and Feb 29 to Feb 28 for a year). */
  const y = end.getUTCFullYear() - (p === 'year' ? 1 : 0);
  const m = end.getUTCMonth() - (p === 'month' ? 1 : 0);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const then = new Date(Date.UTC(y, m, Math.min(end.getUTCDate(), lastDay)));
  return Math.round((end.getTime() - then.getTime()) / 86_400_000);
}

/* The account's currency, from the source. Every money figure in the product
   is formatted through `formatMoney`, so a EUR account reads in euros rather
   than wearing a hard-coded "$" -- which is what it did everywhere. */
export let CURRENCY = 'USD';

/** Money in the account's currency, e.g. "$61,240" or "€61,240". */
export function formatMoney(value: number, decimals = 0): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency', currency: CURRENCY,
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(value);
}

/** The currency's symbol alone, for compact axis labels ("$12k"). */
export function currencySymbol(): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 })
    .formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
}

export interface DayRow {
  spend: number;
  /** Times the ad was served. The denominator under CTR and CPM. */
  impressions: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
}

/**
 * What a medium PHYSICALLY CANNOT PRODUCE.
 *
 * 🚨 G-011. The generator used to give every channel a full funnel: `clicks =
 * leads / cvr` and `impressions = spend / cpm * 1000`, for all six. That put
 * **7,919 clicks on podcasts** and **192,842 impressions on affiliates** —
 * numbers for things that do not exist. An audio ad has no click. A performance
 * affiliate network does not report impressions; they are neither bought nor
 * counted.
 *
 * `CHANNEL_METRICS` already stopped the product DISPLAYING those, which was the
 * September fix. It did not stop the data containing them, so anything reading
 * `DayRow` directly still surfaced the fiction — `exportCsv` wrote a podcast
 * click count into a spreadsheet.
 *
 * ⚠️ **This is deliberately NOT derived from `CHANNEL_METRICS`, and the
 * distinction is the whole point.** That table is a DISPLAY vocabulary — what a
 * channel is bought and judged on. This one is a CAPABILITY claim — what the
 * medium can physically generate. They are not the same list, and conflating
 * them breaks things: Paid Search omits `Impressions` from its display
 * vocabulary because impressions are context rather than the buy, **but Google
 * Ads absolutely does report them, and Paid Search shows CTR — which needs
 * impressions as its denominator.** Zeroing on the display table would have left
 * Paid Search claiming a CTR with nothing underneath it.
 *
 * So: two tables, two jobs, and a test asserting nothing listed here is also
 * offered for display.
 */
const CANNOT_PRODUCE: Partial<Record<ChannelName, ('clicks' | 'impressions')[]>> = {
  /* A podcast ad is audio. There is nothing to click. Attribution runs through
     a promo code or a vanity URL, which is a different event entirely. */
  podcasts: ['clicks'],
  /* Paid on performance. The network reports conversions, not exposure — so an
     impression count would be a fiction, and a CPM computed from it doubly so. */
  affiliates: ['impressions'],
};

export function canProduce(channel: ChannelName, field: 'clicks' | 'impressions'): boolean {
  return !(CANNOT_PRODUCE[channel] ?? []).includes(field);
}

/**
 * Things that HAPPENED in the last week, written into the data rather than into
 * a notification.
 *
 * 🚨 The alerts used to be typed by hand -- "Meta CAC rose 42% week over week",
 * "Affiliate leads spiked 31%" -- over data that was flat to within ±8% every
 * week. A beta tester reading the first and opening Meta saw CAC had FALLEN 5%.
 * The Figma screens were designed around those events, so rather than delete
 * the story, the story is now true: it happens in the data, and the
 * notifications, the Overview strip, the KPI deltas, the decision engine and the
 * assistant all find it there, because they all read these rows.
 *
 * A multiplier on each day's cost-per-lead over the final 7 days. The 30-day
 * window is renormalised afterwards, so every published period total -- Meta's
 * $35.94 CAC, the $160,780 spend -- is unchanged. The week moves; the month does
 * not.
 */
export const LAST_WEEK = 7;
const EVENTS: Partial<Record<ChannelName, { cac: number }>> = {
  /* Advantage+ scaled into a tired audience: each lead costs ~42% more. */
  meta: { cac: 1.49 },
  /* The Tier 1 partner refresh: the same spend buys ~31% more leads. */
  affiliates: { cac: 0.77 },
};

/** The raw funnel, one row per channel per day. Everything else derives from this. */
/**
 * The seeded account, generated. Exported for `sources/seeded.ts` -- the
 * product never calls this directly; it reads whatever `hydrate()` loaded.
 */
export function generateSeeded(): Record<ChannelName, DayRow[]> {
  return Object.fromEntries(
  CHANNEL_KEYS.map((key) => {
    const c = CHANNELS[key];
    const rand = mulberry32(hash(key));
    /* The earlier 90 days draw from their OWN generators. Sharing `rand` would
       shift every value in the recent window the moment history was prepended,
       and every number on every screen would quietly change. */
    const histRand = mulberry32(hash(key + ':history'));

    /* A linear ramp whose halves differ by exactly `trend`.
       If the second half averages (1 + t) times the first, and the ramp runs
       from 1 - k/2 to 1 + k/2, then k = 4t / (2 + t). Solving for k rather
       than hand-tuning a multiplier is what keeps the rendered delta equal to
       the number in the design instead of merely near it. */
    const k = (4 * c.trend) / (2 + c.trend);

    /* `d` counts from the start of the RECENT 90 days, so history is d < 0 and
       the ramp simply continues backwards at the same slope. */
    const shape = Array.from({ length: RECENT }, (_, i) => {
      const d = i - HISTORY;
      const ramp = 1 - k / 2 + (k * d) / (POINTS - 1);
      const weekly = 1 + Math.sin((d / 7) * Math.PI * 2) * 0.08;
      const noise = 0.94 + (d < 0 ? histRand() : rand()) * 0.12;
      return ramp * weekly * noise;
    });

    /* Normalise against the LAST 24 points only, so the 30-day window lands on
       the design's spend figure exactly. Scaling by the full 72 would spread
       the same money across three months and the header would stop matching. */
    const windowSum = shape.slice(-DAYS).reduce((a, b) => a + b, 0);
    const spendByDay = shape.map((f) => (f / windowSum) * c.spend);

    /* Efficiency has to wobble independently of spend.
       If leads were simply spend / cac, then CAC would be spend divided by
       spend over cac — the constant cac, every single day. Same for ROAS.
       The dashboard would report a CAC that never moved and a 0% delta
       forever, which is not a quiet inaccuracy; it is the metric doing
       nothing while appearing to work. */
    const effRand = mulberry32(hash(key + ':efficiency'));
    /* Recent days first and in the original order, history from a separate
       generator -- see histRand. */
    const histEff = mulberry32(hash(key + ':efficiency:history'));
    const event = EVENTS[key]?.cac ?? 1;
    const cacFactor = spendByDay.map((_, i) =>
      (0.86 + (i < HISTORY ? histEff() : effRand()) * 0.28)
      * (i >= RECENT - LAST_WEEK ? event : 1));
    const roasFactor = spendByDay.map((_, i) => 0.9 + (i < HISTORY ? histEff() : effRand()) * 0.2);

    const rawLeads = spendByDay.map((sp, i) => sp / (c.cac * cacFactor[i]));
    const rawRevenue = spendByDay.map((sp, i) => sp * c.roas * roasFactor[i]);

    /* Rescale so the 30-day window still lands on the published blended
       figures exactly. The daily values vary; the period totals do not. */
    const windowSpend = spendByDay.slice(-DAYS).reduce((a, b) => a + b, 0);
    const leadScale =
      (windowSpend / c.cac) / rawLeads.slice(-DAYS).reduce((a, b) => a + b, 0);
    const revScale =
      (windowSpend * c.roas) / rawRevenue.slice(-DAYS).reduce((a, b) => a + b, 0);

    const rows: DayRow[] = spendByDay.map((spend, i) => {
      const leads = rawLeads[i] * leadScale;
      const clicks = leads / c.cvr;
      return {
        spend,
        /* Impressions come from SPEND and the channel's CPM, not from clicks.
           Deriving them from clicks put a podcast at 3.2M impressions for
           $2,894 and a $0.91 CPM -- roughly thirty times off, because a podcast
           has no clicks to derive from.

           This is also the direction the money runs: you buy a thousand
           impressions at a price. CTR then falls out as clicks over
           impressions, and lands in a realistic band for every channel instead
           of being asserted. */
        /* Zeroed where the medium cannot produce them. Zero rather than
           undefined, deliberately: for a podcast, "no clicks" is TRUE — the
           falsehood was 7,919, not 0. And the absence contract already lives in
           CHANNEL_METRICS and `coverageFor`; adding a second one to DayRow would
           be two mechanisms for one job, which is the duplication this codebase
           keeps removing. Ten modules read `.clicks`. */
        impressions: canProduce(key, 'impressions') ? (spend / c.cpm) * 1000 : 0,
        clicks: canProduce(key, 'clicks') ? clicks : 0,
        leads,
        sales: leads * c.closeRate,
        revenue: rawRevenue[i] * revScale,
      };
    });

    /* ⭐ THE ARCHIVE -- the ARCHIVE days before the recent 180, for year-over-
       year. Its own generators (so nothing above changes), and not the ramp
       continued backwards -- run back two years it goes negative. Instead the
       business was smaller: spend compounds at `growth` a year, and each lead
       cost a little more a year ago (the team has been getting better). */
    const archRand = mulberry32(hash(key + ':archive'));
    const archEff = mulberry32(hash(key + ':archive:efficiency'));
    const growth = 0.12 + c.trend * 0.5;
    const edge = shape[0];     // where the recent history starts
    const archive: DayRow[] = Array.from({ length: ARCHIVE }, (_, j) => {
      const d = j - ARCHIVE;   // -ARCHIVE .. -1, days before the recent 180
      const years = -d / 365;
      const weekly = 1 + Math.sin(((d - HISTORY) / 7) * Math.PI * 2) * 0.08;
      const spend = (edge / (1 + growth) ** years) * weekly * (0.94 + archRand() * 0.12)
        / windowSum * c.spend;
      const cacF = (0.86 + archEff() * 0.28) * (1 + 0.08 * years);
      const roasF = (0.9 + archEff() * 0.2) * (1 - 0.05 * years);
      const leads = (spend / (c.cac * cacF)) * leadScale;
      return {
        spend,
        impressions: canProduce(key, 'impressions') ? (spend / c.cpm) * 1000 : 0,
        clicks: canProduce(key, 'clicks') ? leads / c.cvr : 0,
        leads,
        sales: leads * c.closeRate,
        revenue: spend * c.roas * roasF * revScale,
      };
    });
    return [key, [...archive, ...rows]];
  }),
) as Record<ChannelName, DayRow[]>;
}

/* What the product reads. Seeded at import so every screen, test and the
   first paint have data synchronously; `hydrate()` replaces it with any
   source's rows. */
let SERIES: Record<ChannelName, DayRow[]> = generateSeeded();
let VERSION = 0;

/** Bumped on every hydrate -- for anything that caches across renders. */
export function dataVersion(): number { return VERSION; }

/**
 * Load a data source's rows into the product.
 *
 * ⚠️ The seam real integrations plug into (see source.ts). Everything
 * downstream -- totals, deltas, campaigns, decisions, notifications -- is
 * derived from SERIES, so replacing it here is the whole integration from the
 * product's side. Rows must cover the full history (TOTAL_POINTS days) ending
 * on `periodEnd`; a channel the source does not have gets zero rows, which
 * every screen already treats as "no activity".
 */
export function hydrate(data: {
  rows: Partial<Record<ChannelName, DayRow[]>>;
  periodEnd: string;
  currency: string;
}): void {
  const empty = (): DayRow[] => Array.from({ length: TOTAL_POINTS },
    () => ({ spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 }));
  /* A source may have LESS history than TOTAL_POINTS (a real account fetches
     ~15 months). Padded at the front so every series ends on the same day --
     and FIRST marks where real data starts, so a window reaching into the
     padding returns nothing rather than a run of zero-spend days. */
  let longest = 0;
  SERIES = Object.fromEntries(CHANNEL_KEYS.map((k) => {
    const r = data.rows[k];
    if (!r) return [k, empty()];
    if (r.length > TOTAL_POINTS) {
      throw new Error(`${k}: at most ${TOTAL_POINTS} days of rows, got ${r.length}`);
    }
    longest = Math.max(longest, r.length);
    return [k, [...empty().slice(r.length), ...r]];
  })) as Record<ChannelName, DayRow[]>;
  FIRST = TOTAL_POINTS - longest;
  /* WINDOW_END is kept: the app owns it (and the URL), and resetting it here
     would leave the picker saying one thing and the data another. */
  PERIOD_END = new Date(`${data.periodEnd}T00:00:00Z`);
  DAY_LABELS = labelsEnding(PERIOD_END);
  DAY_ISO = datesEnding(PERIOD_END).map((d) => d.toISOString().slice(0, 10));
  CURRENCY = data.currency;
  /* Which channels the source actually reported. A Meta-only account has no
     TikTok; filling it with zeros for the arithmetic is fine, SHOWING it as a
     $0 channel with a $0.00 CAC is not. */
  SUPPLIED = CHANNEL_KEYS.filter((k) => data.rows[k] !== undefined);
  blendCache = null;
  VERSION += 1;
}

/**
 * The channels this account actually runs.
 *
 * A channel that has been switched off is not a channel with no data — it is a
 * channel that is not part of this business. It should be absent from the
 * blend, the tables, the picker and the export, not present and empty. An
 * agency that does no affiliate marketing should never see the word.
 *
 * Held here rather than passed through every call because the blend has to
 * respect it too: `totals('all')` is the sum of what you run, and threading a
 * list through every caller would leave the one that forgets silently
 * reporting a different total from everything beside it.
 */
let ACTIVE: ChannelName[] = [...CHANNEL_KEYS];
let SUPPLIED: ChannelName[] = [...CHANNEL_KEYS];

/** The channels the loaded source reports -- all six on the demo. */
export function suppliedChannels(): ChannelName[] {
  return SUPPLIED;
}

export function activeChannels(): ChannelName[] {
  return ACTIVE;
}

export function setActiveChannels(keys: ChannelName[]) {
  /* Ordered by CHANNEL_KEYS rather than by the caller, so a channel switched
     off and on again returns to its place instead of the end of the list. */
  ACTIVE = CHANNEL_KEYS.filter((k) => keys.includes(k));
  blendCache = null;
}

export function isActive(scope: Scope): boolean {
  return scope === 'all' || ACTIVE.includes(scope);
}

/* Recomputed when the active set changes, not on every read: the blend is 90
   days across six channels and it is read many times per render. */
let blendCache: DayRow[] | null = null;

function blend(): DayRow[] {
  if (blendCache) return blendCache;
  blendCache = Array.from({ length: TOTAL_POINTS }, (_, d) =>
    ACTIVE.reduce<DayRow>(
      (acc, key) => {
        const r = SERIES[key][d];
        return {
          spend: acc.spend + r.spend,
          impressions: acc.impressions + r.impressions,
          clicks: acc.clicks + r.clicks,
          leads: acc.leads + r.leads,
          sales: acc.sales + r.sales,
          revenue: acc.revenue + r.revenue,
        };
      },
      { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
    ),
  );
  return blendCache;
}

/* Exported so campaign series can be derived FROM the channel rows rather
   than generated alongside them. Deriving is what guarantees a channel's
   campaigns sum to that channel; generating separately only hopes they do. */
export function rowsFor(scope: Scope, range: Range = 30, back = 0, shift = 0): DayRow[] {
  const all = scope === 'all' ? blend() : SERIES[scope];
  /* `back` = how many whole windows to step earlier. 0 is the window itself, 1
     is the window immediately before it -- the comparison "Δ Prev" refers to.
     `shift` = days earlier (compare to last week / month / year). */
  return sliceWindow(all, range, back, shift, FIRST);
}

/**
 * Project one metric out of the funnel.
 *
 * CAC and ROAS are computed per day from that day's spend, leads and revenue.
 * For the blended view this means summing the parts first and dividing once —
 * NOT averaging the six channels' ratios. Averaging ratios weights a $510/day
 * podcast spend the same as $2,551/day on Meta and quietly reports a blended
 * CAC that no amount of money was ever actually spent at.
 */
export function series(scope: Scope, metric: Metric, range: Range = 30, shift = 0): { label: string; value: number }[] {
  /* `shift`: the same window, that many days earlier -- the chart's "same
     days last week / month / year". Empty when the data does not reach. */
  const rows = rowsFor(scope, range, 0, shift);
  const labels = windowLabels(range, 0, shift);
  return rows.map((r, i) => {
    let value: number;
    switch (metric) {
      case 'Spend':  value = r.spend; break;
      case 'Clicks': value = r.clicks; break;
      case 'Leads':  value = r.leads; break;
      case 'Sales':  value = r.sales; break;
      case 'CAC':    value = r.leads > 0 ? r.spend / r.leads : 0; break;
      case 'ROAS':   value = r.spend > 0 ? r.revenue / r.spend : 0; break;
    }
    return { label: labels[i], value };
  });
}

/** Period totals, computed the same way — sum the parts, divide once. */
export function totals(scope: Scope, range: Range = 30) {
  const rows = rowsFor(scope, range);
  const sum = rows.reduce(
    (a, r) => ({
      spend: a.spend + r.spend,
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      leads: a.leads + r.leads,
      sales: a.sales + r.sales,
      revenue: a.revenue + r.revenue,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
  );
  return {
    ...sum,
    cac: sum.leads > 0 ? sum.spend / sum.leads : 0,
    roas: sum.spend > 0 ? sum.revenue / sum.spend : 0,
  };
}

/* ------------------------------------------------- direction & verdict -- */

/**
 * Whether a rise in this metric is good news.
 *
 * This lived as an inline `metric !== 'CAC'` in KpiCard's callers, in
 * ChatPanel, and NOT AT ALL in ChannelTable -- which is why the table coloured
 * a rising CAC green while the card above it coloured the same number red.
 * One rule, one place. Adding a second cost metric later is a one-line change
 * here instead of a hunt.
 */
export function higherIsBetter(metric: Metric | undefined): boolean {
  /* Undefined is answered here rather than at each call site, because the two
     callers that can pass it would otherwise each pick their own default and
     one of them would eventually pick the wrong one. Unknown metric => a rise
     is good, which is true for every metric in the set except CAC. */
  return metric !== 'CAC';
}

/** good | bad | flat -- the verdict on a change. */
export type Tone = 'good' | 'bad' | 'flat';

/**
 * The single definition of what a delta MEANS.
 *
 * DeltaBadge owned this, and the sparkline beside it was tinted by channel, so
 * a card could show a red badge next to an amber trend line describing the
 * same decline. Both now read the verdict from here, so the badge and the mark
 * cannot disagree.
 *
 * Zero is deliberately not a direction -- an unchanged metric gets no verdict,
 * or blended CAC renders "up 0%" red while blended ROAS renders "up 0%" green
 * on the same screen, both describing nothing happening.
 */
export function deltaTone(percent: number, better = true): Tone {
  if (percent === 0) return 'flat';
  return (percent > 0) === better ? 'good' : 'bad';
}

/**
 * Period-over-period change: this window against the one immediately before it.
 *
 * 🚨 This used to be `deltaOf(values)`, which split the selected window in half
 * and compared the second half with the first. A "Δ Prev" badge that reads as
 * "vs the previous period" but means "the back half vs the front half of THIS
 * period" is a wrong number wearing the right label -- and on a 7-day range it
 * compared 3 days with 4. It also averaged daily ratios, so a CAC delta was the
 * change in the mean of daily CACs, not in the period's CAC.
 *
 * Now both windows are summed first and the metric is taken ONCE from each, the
 * way every period total in this codebase is. Returns 0 when there is no prior
 * window or its figure is 0 -- there is nothing to compare against.
 */
export function changeOf(metric: DerivedMetric, current: DayRow[], prior: DayRow[]): number {
  /* NaN, not 0, when there is nothing to compare: 0 renders "0% -- no
     change", a claim; NaN renders a dash. (A custom window at the start of the
     data has no window before it.) */
  if (current.length === 0 || prior.length === 0) return NaN;
  const sum = (rs: DayRow[]) => rs.reduce<DayRow>((a, r) => ({
    spend: a.spend + r.spend, impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks, leads: a.leads + r.leads,
    sales: a.sales + r.sales, revenue: a.revenue + r.revenue,
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });
  /* 🐛 A window with spend and NO leads has no CAC; valueOf says 0, and 0
     against last period's $40 read as "CAC −100%" -- coloured good. Either
     window unable to report the metric means there is no change to state.
     (The collapse itself is still reported -- by Leads, at −100%.) */
  const a = sum(prior); const b = sum(current);
  if (!reportable(metric, a) || !reportable(metric, b)) return NaN;
  const before = valueOf(metric, a);
  if (before === 0) return NaN;
  const now = valueOf(metric, b);
  return Math.round(((now - before) / before) * 100);
}

export function delta(scope: Scope, metric: Metric, range: Range = 30): number {
  return changeOf(metric, rowsFor(scope, range), rowsFor(scope, range, 1));
}

/**
 * A short sample of the series for the sparkline mark.
 *
 * Returns RAW values. It used to return numbers pre-normalised to 0.25-1,
 * which meant every caller inherited one hard-coded floor and the mark could
 * not choose its own scaling — and a value of 0 rendered a quarter-height bar
 * as if it were real.
 */
export function sampleOf(s: number[], points = 7): number[] {
  if (s.length <= points) return s;

  /* Spread the samples across the WHOLE series, last point included.

     It was `i * step` with step = floor(length / points), which walks from 0
     and stops early: at 30 days it read indices 0,4..24 and never saw the last
     5; at 90 days step is 12, so it stopped at index 72 and the most recent
     17 days were invisible.

     That is not a rounding detail. delta() compares the full series, so on a
     90-day view where a channel collapses in its final fortnight the badge went
     red while the sparkline beside it -- blind to those days -- still trended
     up. Two marks describing one series, disagreeing, in both the KPI card and
     the table's trend column.

     Dividing by (points - 1) makes the last sample land exactly on the last
     index, so the mark ends where the number does. */
  const stride = (s.length - 1) / (points - 1);
  return Array.from({ length: points }, (_, i) => s[Math.round(i * stride)]);
}

export function sparkline(scope: Scope, metric: Metric, range: Range = 30, points = 7): number[] {
  return sampleOf(series(scope, metric, range).map((d) => d.value), points);
}

/** The raw funnel rows behind a view, with their labels. Used by the export. */
export function rows(scope: Scope, range: Range = 30) {
  /* 🐛 Was DAY_LABELS.slice(-range): under custom dates every CSV row carried
     the date 12 days AFTER its data. The window owns the labels too. */
  const labels = windowLabels(range);
  return rowsFor(scope, range).map((r, i) => ({ label: labels[i], ...r }));
}

/* ---------- formatting ---------- */

export function formatMetric(metric: Metric, value: number): string {
  switch (metric) {
    case 'Spend':  return formatMoney(value);
    case 'CAC':    return formatMoney(value, 2);
    case 'ROAS':   return `${value.toFixed(1)}x`;
    default:       return Math.round(value).toLocaleString();
  }
}

/** CAC and ROAS are ratios: they do not accumulate, so they never get bars. */
export function isRatio(metric: Metric): boolean {
  return metric === 'CAC' || metric === 'ROAS';
}

/**
 * Four y-axis ticks, top down.
 *
 * `zeroBased` is not a style choice. A bar encodes magnitude as length from
 * zero, so a bar chart MUST start at zero or the lengths lie. A line encodes
 * change as slope and carries no such obligation — and for a ratio it must
 * not, because ROAS moving 4.5 to 4.7 against a zero floor renders as a flat
 * line and hides the only thing the chart is for.
 */
export function yTicks(
  metric: Metric,
  data: { value: number }[],
  zeroBased = true,
): string[] {
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);

  if (zeroBased) {
    const nice = niceCeil(max);
    return [3, 2, 1, 0].map((i) => shortLabel(metric, (nice / 3) * i));
  }

  const min = Math.min(...values);
  const pad = (max - min) * 0.15 || max * 0.05;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  return [3, 2, 1, 0].map((i) => shortLabel(metric, lo + ((hi - lo) / 3) * i));
}

/** The plotted domain, matching what yTicks labelled. */
export function domainFor(
  data: { value: number }[],
  zeroBased = true,
): [number, number] {
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  if (zeroBased) return [0, niceCeil(max)];
  const min = Math.min(...values);
  const pad = (max - min) * 0.15 || max * 0.05;
  return [Math.max(0, min - pad), max + pad];
}

function niceCeil(n: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const norm = n / mag;
  const step = norm <= 1.5 ? 1.5 : norm <= 3 ? 3 : norm <= 6 ? 6 : 10;
  return step * mag;
}

function shortLabel(metric: Metric, v: number): string {
  if (metric === 'ROAS') return `${v.toFixed(1)}x`;
  const money = metric === 'Spend' || metric === 'CAC';
  const prefix = money ? currencySymbol() : '';
  if (v >= 1000) return `${prefix}${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${prefix}${Math.round(v)}`;
}
