import { describe, expect, it } from 'vitest';
import { compact, expand, fromWire } from '../sources/wire';
import { normalizeMeta } from '../sources/metaNormalize';
import { normalizeGoogle, type GRow } from '../sources/googleNormalize';

const day = (i: number) => new Date(Date.UTC(2026, 8, 28 - i)).toISOString().slice(0, 10);

/* A mid-size Meta account: 6 campaigns x 2 ad sets x 3 ads, 90 days, some
   paused, one campaign with no ads at all. */
function meta() {
  const campaigns = Array.from({ length: 6 }, (_, c) => ({ id: `c${c}`, name: `Campaign ${c} — "Q4" 20% Off`, objective: 'OUTCOME_LEADS', effective_status: c % 3 ? 'ACTIVE' : 'PAUSED' }));
  campaigns.push({ id: 'empty', name: 'No ads yet', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' });
  const adsets = campaigns.slice(0, 6).flatMap((c) => [0, 1].map((s) => ({ id: `${c.id}s${s}`, name: `Set ${s}`, campaign_id: c.id, effective_status: 'ACTIVE' })));
  const ads = adsets.flatMap((s) => [0, 1, 2].map((a) => ({ id: `${s.id}a${a}`, name: `Ad ${a} 🚀`, adset_id: s.id, campaign_id: s.campaign_id, effective_status: 'ACTIVE' })));
  const insights = ads.flatMap((a, k) => Array.from({ length: 90 }, (_, i) => ({
    campaign_id: a.campaign_id, adset_id: a.adset_id, ad_id: a.id, date_start: day(i),
    spend: String(10 + ((k * 7 + i) % 13) + 0.37), impressions: '1000', clicks: String(20 + (i % 5)),
    actions: [{ action_type: 'lead', value: String((k + i) % 4) }],
    action_values: [{ action_type: 'purchase', value: String(((k + i) % 3) * 12.5) }],
  })));
  return normalizeMeta({ account: { name: 'Acme', currency: 'USD', timezone_name: 'America/Detroit' }, campaigns, adsets, ads, insights, now: new Date('2026-09-29T15:00:00Z'), days: 455 });
}

function google() {
  const rows: GRow[] = Array.from({ length: 60 }, (_, i) => [
    { campaign: { id: 'pm' }, segments: { date: day(i) }, metrics: { costMicros: String(50_123_456 + i), impressions: '900', clicks: '30' } },
    { campaign: { id: 'pm' }, segments: { date: day(i), conversionActionCategory: 'PURCHASE' }, metrics: { conversions: 1.37, conversionsValue: 88.1 } },
  ]).flat();
  return normalizeGoogle({
    customer: { descriptiveName: 'G', currencyCode: 'EUR', timeZone: 'Europe/Berlin' },
    campaigns: [{ campaign: { id: 'pm', name: 'PMax — All', status: 'ENABLED', advertisingChannelType: 'PERFORMANCE_MAX' } }],
    metrics: rows, now: new Date('2026-09-29T15:00:00Z'), days: 455,
  });
}

const close = (a: unknown, b: unknown) => expect(JSON.parse(JSON.stringify(a, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v))))
  .toEqual(JSON.parse(JSON.stringify(b, (_k, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v))));

describe('SourceData over the wire', () => {
  it('⭐ Meta: compact -> expand gives back the same account -- every tier, every day', () => {
    const d = meta();
    close(expand(JSON.parse(JSON.stringify(compact(d)))), d);
  });

  it('Google: Performance Max (no ads) keeps its own rows', () => {
    const d = google();
    close(expand(JSON.parse(JSON.stringify(compact(d)))), d);
  });

  it('⭐ much smaller on the wire', () => {
    const d = meta();
    const plain = JSON.stringify(d).length;
    const small = JSON.stringify(compact(d)).length;
    expect(small / plain).toBeLessThan(0.3);
  });

  it('an older server’s plain payload still loads', () => {
    const d = meta();
    expect(fromWire(d)).toBe(d);
  });
});
