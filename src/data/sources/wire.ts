import type { ChannelName } from '../../styles/tokens';
import type { DayRow } from '../metrics';
import type { SourceAd, SourceAdSet, SourceCampaign, SourceData } from '../source';

/**
 * SourceData over the wire -- compact, then expanded back exactly.
 *
 * 🐛 A realistic Meta account (60 campaigns, 1,200 ads, 455 days) was 51 MB of
 * JSON, and ~80% of it was the same six key names repeated on every day of
 * every ad. Campaign and ad-set rows were sent too, though both are just sums
 * of their ads.
 *
 * On the wire now: each series is six parallel number arrays (no repeated
 * keys), and a campaign with ads sends NO rows of its own -- its ad sets and
 * itself are summed again on arrival, which also keeps "the tiers reconcile by
 * construction" true on the client rather than trusting the payload.
 * Campaigns without ads (Performance Max) keep their own rows.
 */

export interface Columns { s: number[]; i: number[]; c: number[]; l: number[]; a: number[]; r: number[] }

export interface WireData {
  v: 1;
  account: SourceData['account'];
  rows: Partial<Record<ChannelName, Columns>>;
  campaigns?: WireCampaign[];
}
interface WireCampaign extends Omit<SourceCampaign, 'rows' | 'adSets' | 'ads'> {
  rows?: Columns;
  adSets?: Omit<SourceAdSet, 'rows'>[];
  ads?: (Omit<SourceAd, 'rows'> & { rows: Columns })[];
}

/* 6 decimals: money and fractional conversions survive exactly as displayed,
   and a float's 17-digit tail stops costing bytes. */
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function toColumns(rows: DayRow[]): Columns {
  const out: Columns = { s: [], i: [], c: [], l: [], a: [], r: [] };
  for (const x of rows) {
    out.s.push(r6(x.spend)); out.i.push(r6(x.impressions)); out.c.push(r6(x.clicks));
    out.l.push(r6(x.leads)); out.a.push(r6(x.sales)); out.r.push(r6(x.revenue));
  }
  return out;
}

export function fromColumns(c: Columns): DayRow[] {
  return c.s.map((spend, k) => ({
    spend, impressions: c.i[k], clicks: c.c[k], leads: c.l[k], sales: c.a[k], revenue: c.r[k],
  }));
}

export function compact(d: SourceData): WireData {
  return {
    v: 1,
    account: d.account,
    rows: Object.fromEntries(Object.entries(d.rows).map(([k, v]) => [k, toColumns(v!)])),
    campaigns: d.campaigns?.map((c) => {
      const { rows, adSets, ads, ...rest } = c;
      if (ads && ads.length) {
        return {
          ...rest,
          adSets: adSets?.map(({ rows: _drop, ...s }) => s),
          ads: ads.map(({ rows: ar, ...a }) => ({ ...a, rows: toColumns(ar) })),
        };
      }
      /* `ads: []` survives as []: "loaded, and there are none" is not the same
         as "not loaded" (undefined), and the screens say different things. */
      return {
        ...rest, rows: toColumns(rows),
        ...(adSets ? { adSets: adSets.map(({ rows: _d, ...s }) => s) } : {}),
        ...(ads ? { ads: [] } : {}),
      };
    }),
  };
}

const zero = (): DayRow => ({ spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });
function addInto(into: DayRow[], from: DayRow[]) {
  from.forEach((r, k) => {
    const t = into[k];
    t.spend += r.spend; t.impressions += r.impressions; t.clicks += r.clicks;
    t.leads += r.leads; t.sales += r.sales; t.revenue += r.revenue;
  });
}

export function expand(w: WireData): SourceData {
  const days = Object.values(w.rows)[0]?.s.length ?? 0;
  return {
    account: w.account,
    rows: Object.fromEntries(Object.entries(w.rows).map(([k, v]) => [k, fromColumns(v!)])),
    campaigns: w.campaigns?.map((c): SourceCampaign => {
      const { rows, adSets, ads, ...rest } = c;
      if (ads && ads.length) {
        const fullAds: SourceAd[] = ads.map((a) => ({ ...a, rows: fromColumns(a.rows) }));
        const sets: SourceAdSet[] = (adSets ?? []).map((s) => ({ ...s, rows: Array.from({ length: days }, zero) }));
        const byId = new Map(sets.map((s) => [s.id, s]));
        const sum = Array.from({ length: days }, zero);
        for (const a of fullAds) {
          addInto(sum, a.rows);
          const s = byId.get(a.adSetId);
          if (s) addInto(s.rows, a.rows);
        }
        return { ...rest, rows: sum, adSets: sets, ads: fullAds };
      }
      return {
        ...rest,
        rows: rows ? fromColumns(rows) : Array.from({ length: days }, zero),
        ...(adSets ? { adSets: adSets.map((s) => ({ ...s, rows: Array.from({ length: days }, zero) })) } : {}),
        ...(ads ? { ads: [] } : {}),
      };
    }),
  };
}

/** Whatever arrived: the compact form, or a plain SourceData (older server). */
export function fromWire(body: unknown): SourceData {
  return (body as { v?: number }).v === 1 ? expand(body as WireData) : body as SourceData;
}
