// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { rankedAds } from '../adRanking';
import { addFlag, liveFlags, removeFlag } from '../attention';
import { syncChannels } from '../channels';
import { creativeSeries, creativeTotals, creativesFor } from '../creative';
import { buildCsv } from '../exportCsv';
import { activeChannels, changeOf, hydrate, type DayRow } from '../metrics';
import { reports } from '../reports';
import { seededSource } from '../sources/seeded';
import { normalizeMeta } from '../sources/metaNormalize';
import { applyStructure } from '../structure';
import { CAMPAIGNS } from '../campaigns';

/*
 * Regressions from the Sept 29 data-layer audit. Each test names the bug it
 * pins; each failed against the code before its fix.
 */

const seed = () => {
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
  applyStructure(undefined);
  syncChannels(false);
};
afterEach(seed);

const day = (i: number) => new Date(Date.UTC(2026, 8, 28 - i)).toISOString().slice(0, 10);
/** A Meta-only account: one campaign, three ads -- A 2 leads/day, B spends with none, C 1 lead/day. */
function metaAccount() {
  const insight = (ad: string, leads: number) => Array.from({ length: 30 }, (_, i) => ({
    campaign_id: '1', adset_id: 's1', ad_id: ad, date_start: day(i),
    spend: '100', impressions: '10000', clicks: '200',
    actions: leads ? [{ action_type: 'lead', value: String(leads) }] : [],
  }));
  const d = normalizeMeta({
    account: { name: 'Acme', currency: 'USD', timezone_name: 'America/Detroit' },
    campaigns: [{ id: '1', name: 'Spring', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' }],
    adsets: [{ id: 's1', name: 'Broad', campaign_id: '1', effective_status: 'ACTIVE' }],
    ads: ['A', 'B', 'C'].map((id) => ({ id, name: `Ad ${id}`, adset_id: 's1', campaign_id: '1', effective_status: 'ACTIVE' })),
    insights: [...insight('A', 2), ...insight('B', 0), ...insight('C', 1)],
    now: new Date('2026-09-29T15:00:00Z'), days: 180,
  });
  hydrate({ rows: d.rows, periodEnd: d.account.periodEnd, currency: d.account.currency });
  applyStructure(d.campaigns);
  syncChannels(false);
}

describe('the ad chart', () => {
  it('🐛 plots the ad’s own rows -- its leads sum to the ad’s own total', () => {
    const ad = creativesFor(CAMPAIGNS[0].id)[0];
    const sum = creativeSeries(ad.id, 'Leads', 30).reduce((a, p) => a + p.value, 0);
    expect(sum).toBeCloseTo(creativeTotals(ad.id, 30).leads, 6);
  });
  it('🐛 a real ad with no leads is drawn at zero leads, not the campaign’s share', () => {
    metaAccount();
    expect(creativeSeries('meta-B', 'Leads', 30).every((p) => p.value === 0)).toBe(true);
  });
});

describe('ranking', () => {
  it('🐛 an ad with no leads has no CAC -- it ranks LAST, never first as "$0"', () => {
    metaAccount();
    for (const mode of ['absolute', 'relative'] as const) {
      const list = rankedAds('CAC', mode, 30, ['meta']);
      expect(list.map((r) => r.creative.id).at(-1)).toBe('meta-B');
      expect(list.at(-1)!.value).toBeNull();
      expect(list.at(-1)!.benchmark).toBeNull();
    }
    expect(rankedAds('CAC', 'absolute', 30, ['meta'])[0].creative.id).toBe('meta-A');
  });
});

describe('real accounts', () => {
  it('🐛 a Meta-only account shows Meta -- not five other channels at $0', () => {
    metaAccount();
    expect(activeChannels()).toEqual(['meta']);
    seed();
    expect(activeChannels()).toHaveLength(6);
  });

  it('🐛 a flag on a real campaign is live once that account loads', () => {
    addFlag('campaign', 'meta-1', 'Spring');
    expect(liveFlags().some((f) => f.refId === 'meta-1')).toBe(false);   // demo: no such campaign
    metaAccount();
    expect(liveFlags().some((f) => f.refId === 'meta-1')).toBe(true);
    removeFlag('campaign', 'meta-1');
  });

  it('🐛 the demo’s "last sent" dates do not appear on a real account', () => {
    expect(reports().some((r) => r.lastRun)).toBe(true);
    metaAccount();
    expect(reports().some((r) => r.lastRun)).toBe(false);
  });
});

describe('no number where there is nothing to divide by', () => {
  const row = (spend: number, leads: number): DayRow => ({ spend, impressions: 1000, clicks: 50, leads, sales: 0, revenue: 0 });
  it('🐛 CAC change is not "−100%" when this week had spend and no leads', () => {
    expect(changeOf('CAC', [row(100, 0)], [row(100, 5)])).toBe(0);
    expect(changeOf('Leads', [row(100, 0)], [row(100, 5)])).toBe(-100);   // the collapse is still reported
  });

  it('🐛 the CSV total leaves CAC blank with no leads, and fractional leads sum to the total', () => {
    const rows = Array.from({ length: 180 }, () => ({ spend: 10, impressions: 100, clicks: 5, leads: 0.4, sales: 0, revenue: 0 }));
    hydrate({ rows: { paidSearch: rows }, periodEnd: '2026-09-28', currency: 'USD' });
    syncChannels(false);
    const lines = buildCsv('paidSearch', 30).split('\n');
    const dayLeads = lines.slice(1, -1).reduce((a, l) => a + Number(l.split(',')[4]), 0);
    const total = Number(lines.at(-1)!.split(',')[4]);
    expect(dayLeads).toBeCloseTo(total, 6);

    const none = Array.from({ length: 180 }, () => ({ spend: 10, impressions: 100, clicks: 5, leads: 0, sales: 0, revenue: 0 }));
    hydrate({ rows: { paidSearch: none }, periodEnd: '2026-09-28', currency: 'USD' });
    expect(buildCsv('paidSearch', 30).split('\n').at(-1)!.split(',')[7]).toBe('');
  });
});
