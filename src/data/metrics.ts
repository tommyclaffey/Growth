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

export type Metric = 'Spend' | 'Clicks' | 'Leads' | 'Sales' | 'CAC' | 'ROAS';
export const METRICS: Metric[] = ['Spend', 'Clicks', 'Leads', 'Sales', 'CAC', 'ROAS'];

/* 72 points of history so the range picker has something real to select from.
   The 30-day window is the last 24 of them, and that is the window normalised
   to the design's totals — so "Last 30 days" still reads $160,780 exactly,
   while 7 and 90 day are honestly derived rather than faked. */
export const POINTS = 90;
export const DAYS = 30;

export type Range = 7 | 30 | 90;
export const RANGES: Range[] = [7, 30, 90];
const POINTS_FOR: Record<Range, number> = { 7: 7, 30: 30, 90: 90 };
export const RANGE_LABEL: Record<Range, string> = {
  7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days',
};

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
  trend: number;      // second half vs first half, as a fraction
}> = {
  meta:       { label: 'Meta',        spend: 61240, cvr: 0.034, closeRate: 0.12, roas: 4.6, cac:  35.94, trend:  0.06 },
  tiktok:     { label: 'TikTok',      spend: 28110, cvr: 0.021, closeRate: 0.09, roas: 3.9, cac:  33.38, trend: -0.03 },
  youtube:    { label: 'YouTube',     spend: 22470, cvr: 0.018, closeRate: 0.10, roas: 3.1, cac:  40.05, trend:  0.02 },
  affiliates: { label: 'Affiliates',  spend: 18320, cvr: 0.052, closeRate: 0.18, roas: 5.2, cac:  36.79, trend:  0.11 },
  paidSearch: { label: 'Paid Search', spend: 18400, cvr: 0.041, closeRate: 0.15, roas: 3.4, cac:  85.98, trend:  0.04 },
  podcasts:   { label: 'Podcasts',    spend: 12240, cvr: 0.012, closeRate: 0.07, roas: 2.1, cac: 128.80, trend: -0.01 },
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
/* One point per day, ending on a fixed date so the labels never shift under
   the reader. A dashboard whose axis moves between two screenshots of the
   same data is one nobody trusts. */
const PERIOD_END = new Date(Date.UTC(2026, 7, 12)); // 12 Aug 2026
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export const DAY_LABELS = Array.from({ length: POINTS }, (_, i) => {
  const d = new Date(PERIOD_END);
  d.setUTCDate(d.getUTCDate() - (POINTS - 1 - i));
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
});

export interface DayRow {
  spend: number;
  clicks: number;
  leads: number;
  sales: number;
  revenue: number;
}

/** The raw funnel, one row per channel per day. Everything else derives from this. */
const SERIES: Record<ChannelName, DayRow[]> = Object.fromEntries(
  CHANNEL_KEYS.map((key) => {
    const c = CHANNELS[key];
    const rand = mulberry32(hash(key));

    /* A linear ramp whose halves differ by exactly `trend`.
       If the second half averages (1 + t) times the first, and the ramp runs
       from 1 - k/2 to 1 + k/2, then k = 4t / (2 + t). Solving for k rather
       than hand-tuning a multiplier is what keeps the rendered delta equal to
       the number in the design instead of merely near it. */
    const k = (4 * c.trend) / (2 + c.trend);

    const shape = Array.from({ length: POINTS }, (_, d) => {
      const ramp = 1 - k / 2 + (k * d) / (POINTS - 1);
      const weekly = 1 + Math.sin((d / 7) * Math.PI * 2) * 0.08;
      const noise = 0.94 + rand() * 0.12;
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
    const cacFactor = spendByDay.map(() => 0.86 + effRand() * 0.28);
    const roasFactor = spendByDay.map(() => 0.9 + effRand() * 0.2);

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
      return {
        spend,
        clicks: leads / c.cvr,
        leads,
        sales: leads * c.closeRate,
        revenue: rawRevenue[i] * revScale,
      };
    });
    return [key, rows];
  }),
) as Record<ChannelName, DayRow[]>;

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
  blendCache = Array.from({ length: POINTS }, (_, d) =>
    ACTIVE.reduce<DayRow>(
      (acc, key) => {
        const r = SERIES[key][d];
        return {
          spend: acc.spend + r.spend,
          clicks: acc.clicks + r.clicks,
          leads: acc.leads + r.leads,
          sales: acc.sales + r.sales,
          revenue: acc.revenue + r.revenue,
        };
      },
      { spend: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
    ),
  );
  return blendCache;
}

function rowsFor(scope: Scope, range: Range = 30): DayRow[] {
  const all = scope === 'all' ? blend() : SERIES[scope];
  return all.slice(-POINTS_FOR[range]);
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
export function series(scope: Scope, metric: Metric, range: Range = 30): { label: string; value: number }[] {
  const rows = rowsFor(scope, range);
  const labels = DAY_LABELS.slice(-POINTS_FOR[range]);
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
      clicks: a.clicks + r.clicks,
      leads: a.leads + r.leads,
      sales: a.sales + r.sales,
      revenue: a.revenue + r.revenue,
    }),
    { spend: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
  );
  return {
    ...sum,
    cac: sum.leads > 0 ? sum.spend / sum.leads : 0,
    roas: sum.spend > 0 ? sum.revenue / sum.spend : 0,
  };
}

/** Percentage change, last 12 days against the 12 before them. */
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

export function delta(scope: Scope, metric: Metric, range: Range = 30): number {
  const s = series(scope, metric, range).map((d) => d.value);
  const half = Math.floor(s.length / 2);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const prev = avg(s.slice(0, half));
  const curr = avg(s.slice(half));
  if (prev === 0) return 0;
  return Math.round(((curr - prev) / prev) * 100);
}

/**
 * A short sample of the series for the sparkline mark.
 *
 * Returns RAW values. It used to return numbers pre-normalised to 0.25-1,
 * which meant every caller inherited one hard-coded floor and the mark could
 * not choose its own scaling — and a value of 0 rendered a quarter-height bar
 * as if it were real.
 */
export function sparkline(scope: Scope, metric: Metric, range: Range = 30, points = 7): number[] {
  const s = series(scope, metric, range).map((d) => d.value);
  const step = Math.max(1, Math.floor(s.length / points));
  return Array.from({ length: points }, (_, i) => s[Math.min(i * step, s.length - 1)]);
}

/** The raw funnel rows behind a view, with their labels. Used by the export. */
export function rows(scope: Scope, range: Range = 30) {
  const labels = DAY_LABELS.slice(-POINTS_FOR[range]);
  return rowsFor(scope, range).map((r, i) => ({ label: labels[i], ...r }));
}

/* ---------- formatting ---------- */

export function formatMetric(metric: Metric, value: number): string {
  switch (metric) {
    case 'Spend':  return `$${Math.round(value).toLocaleString()}`;
    case 'CAC':    return `$${value.toFixed(2)}`;
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
  const prefix = money ? '$' : '';
  if (v >= 1000) return `${prefix}${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`;
  return `${prefix}${Math.round(v)}`;
}
