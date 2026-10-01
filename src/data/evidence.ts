import type { DayRow } from './metrics';

/**
 * ⭐ THE TWO QUESTIONS A SENIOR BUYER ASKS OF EVERY RECOMMENDATION.
 *
 *   1. "Is that real, or is it noise?"   → `rateTest`
 *   2. "What does the NEXT dollar buy?"   → `responseCurve` + `projectRaise`
 *
 * The engine already refused to say WHY a number moved (no attribution model).
 * It still said "this ad paid $67.95 a lead" without asking how many leads that
 * was. Eight leads at $67.95 and eighty leads at $67.95 are different claims:
 * the first is a coin landing heads three times. And every "raise 20%" assumed
 * the 20% would buy leads at today's AVERAGE price, which is the one thing an
 * ad auction reliably does not do -- the next dollar buys the next-cheapest
 * impression, and that is dearer than the last.
 *
 * Both answers are standard, checkable statistics, computed here from the same
 * daily rows the charts draw. No model, no API key, unit-tested.
 */

export interface Sample { spend: number; leads: number }

export type Level = 'high' | 'medium' | 'low';

export interface Confidence {
  level: Level;
  /** Two-sided p-value: how often a gap this size appears by chance alone. */
  p: number;
  /** Leads behind the claim, both sides. The number a reader can sanity-check. */
  leads: number;
  /** One plain sentence, for the card. */
  sentence: string;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/* ⚠️ Where the lines sit. 95% is the conventional bar; 80% is the bar most
   paid-media teams act on, because waiting for 95% on a week of data means
   never acting. Below 80%, the engine holds the finding back rather than
   recommending on what could be a coin flip. */
const HIGH = 0.05;
const MEDIUM = 0.2;

/**
 * Is subject A's cost per lead really different from B's, or could the gap be
 * chance?
 *
 * Leads arrive as counts against money spent, so the honest model is two
 * Poisson rates (leads per dollar) with spend as the exposure. Conditioned on
 * the total, A's share of the leads is Binomial(n, sA / (sA + sB)) if the two
 * rates are equal -- the textbook conditional test for comparing two rates.
 * Normal approximation with a continuity correction; exact enough above ~10
 * leads, and below that the answer is "low" either way.
 *
 * B must NOT contain A. "This ad vs its channel" compares the ad against the
 * REST of the channel -- an ad compared with a total it is part of is partly
 * compared with itself, which shrinks every gap.
 */
export function rateTest(a: Sample, b: Sample): Confidence {
  const n = a.leads + b.leads;
  const leads = Math.round(n);
  if (a.spend <= 0 || b.spend <= 0 || n < 1) {
    return { level: 'low', p: 1, leads, sentence: 'Too little data to tell this apart from chance.' };
  }
  const share = a.spend / (a.spend + b.spend);
  const mean = n * share;
  const sd = Math.sqrt(n * share * (1 - share));
  const gap = Math.max(0, Math.abs(a.leads - mean) - 0.5);
  const z = sd > 0 ? gap / sd : 0;
  const p = Math.min(1, 2 * (1 - normalCdf(z)));
  const level: Level = p < HIGH ? 'high' : p < MEDIUM ? 'medium' : 'low';
  const odds = p < 0.01 ? 'less than 1 time in 100'
    : `about ${Math.max(1, Math.round(p * 100))} ${Math.max(1, Math.round(p * 100)) === 1 ? 'time' : 'times'} in 100`;
  const sentence = level === 'low'
    ? `${count(leads)} leads: a gap this size shows up by chance ${odds}. Not enough to act on yet.`
    : `${count(leads)} leads behind it: a gap this size shows up by chance ${odds}.`;
  return { level, p, leads, sentence };
}

const count = (n: number) => Math.round(n).toLocaleString();

/* ------------------------------------------------------------------------ */

export interface Curve {
  /**
   * Elasticity of leads to spend: +10% spend → about +b×10% leads. 1 means
   * every extra dollar buys at today's average price; 0.6 means the next dollar
   * buys 60% as much. Clamped to [0.2, 1].
   */
  b: number;
  /** Measured from its own history, or the stated default. */
  measured: boolean;
  /** Days the fit used. */
  days: number;
  /** Share of the day-to-day variation in leads the curve explains. */
  r2: number;
}

/** What the engine assumes when an account's own history cannot say. */
export const DEFAULT_ELASTICITY = 0.8;

/**
 * How leads respond to spend, from the campaign's OWN daily history.
 *
 * The standard media-mix shape: log(leads) = a + b·log(spend), fitted by least
 * squares. Its slope b is the elasticity. Below 1 is diminishing returns -- the
 * normal state of any auction-bought media.
 *
 * ⚠️ Only trusted when the history can actually show it: four weeks of days,
 * spend that genuinely moved (a campaign spending the same every day has no
 * information about what more would do), and a fit that explains something.
 * Otherwise it says so and falls back to DEFAULT_ELASTICITY -- labelled as an
 * assumption on the card, never passed off as a measurement.
 */
export function responseCurve(rows: DayRow[]): Curve {
  const pts = rows.filter((r) => r.spend > 0).map((r) => ({ x: Math.log(r.spend), y: Math.log(r.leads + 0.5) }));
  const fallback: Curve = { b: DEFAULT_ELASTICITY, measured: false, days: pts.length, r2: 0 };
  if (pts.length < 28) return fallback;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  let sxx = 0; let sxy = 0; let syy = 0;
  for (const p of pts) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2; }
  const sdx = Math.sqrt(sxx / pts.length);
  /* Spend within ~±15% of its mean every day: nothing to learn from. */
  if (sdx < 0.15 || syy === 0) return fallback;
  const b = sxy / sxx;
  const r2 = (sxy * sxy) / (sxx * syy);
  if (r2 < 0.1 || !Number.isFinite(b)) return fallback;
  return { b: Math.min(1, Math.max(0.2, b)), measured: true, days: pts.length, r2 };
}

export interface Projection {
  extraSpend: number;
  extraLeads: number;
  /** What the EXTRA money pays per lead -- not the average. */
  marginalCac: number;
}

/**
 * What raising spend by `r` (0.2 = +20%) buys, on the curve.
 *
 * leads ∝ spend^b, so +r spend → leads × (1+r)^b. The extra leads are
 * leads × ((1+r)^b − 1), and the extra money pays extraSpend / extraLeads for
 * them -- the marginal cost, which is the number a budget decision is about.
 */
export function projectRaise(base: Sample, r: number, curve: Curve): Projection {
  const extraSpend = base.spend * r;
  const extraLeads = base.leads * ((1 + r) ** curve.b - 1);
  return { extraSpend, extraLeads, marginalCac: extraLeads > 0 ? extraSpend / extraLeads : Infinity };
}
