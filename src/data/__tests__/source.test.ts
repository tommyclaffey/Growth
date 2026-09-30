// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  CHANNEL_KEYS, DAY_LABELS, PERIOD_END, TOTAL_POINTS, formatMetric, hydrate, totals, type DayRow, rowsFor, hasWindow,
} from '../metrics';
import { formatDerived } from '../channelMetrics';
import { seededSource } from '../sources/seeded';
import { useDataSource } from '../useDataSource';
import type { DataSource, SourceData } from '../source';

/* Put the demo account back -- hydrate replaces module state every test reads. */
afterEach(() => {
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
});

const flat = (spend: number): DayRow[] => Array.from({ length: TOTAL_POINTS },
  () => ({ spend, impressions: spend * 100, clicks: spend, leads: spend / 10, sales: 1, revenue: spend * 3 }));

const fake = (over: Partial<SourceData['account']> = {}, spend = 100): SourceData => ({
  account: { name: 'Acme', currency: 'EUR', timezone: 'Europe/Dublin', periodEnd: '2026-09-28', ...over },
  rows: Object.fromEntries(CHANNEL_KEYS.map((k) => [k, flat(spend)])),
});

describe('⭐ the product runs on ANY source loaded through hydrate()', () => {
  it('every number downstream comes from the loaded rows', () => {
    const d = fake();
    hydrate({ rows: d.rows, periodEnd: d.account.periodEnd, currency: d.account.currency });
    expect(totals('meta', 30).spend).toBe(3000);
    expect(totals('all', 7).spend).toBe(7 * 100 * CHANNEL_KEYS.length);
  });

  it('"today" is the source’s last day -- the clock is no longer frozen in code', () => {
    const d = fake({ periodEnd: '2026-09-28' });
    hydrate({ rows: d.rows, periodEnd: d.account.periodEnd, currency: d.account.currency });
    expect(PERIOD_END.toISOString().slice(0, 10)).toBe('2026-09-28');
    expect(DAY_LABELS[DAY_LABELS.length - 1]).toBe('Sep 28');
  });

  it('money is formatted in the ACCOUNT’s currency, not a hard-coded $', () => {
    const d = fake({ currency: 'EUR' });
    hydrate({ rows: d.rows, periodEnd: d.account.periodEnd, currency: d.account.currency });
    expect(formatMetric('Spend', 1234)).toMatch(/€/);
    expect(formatDerived('CAC', 12.5)).toMatch(/€/);
    expect(formatMetric('Spend', 1234)).not.toMatch(/\$/);
  });

  it('a channel the source does not have becomes zero rows, not a crash', () => {
    hydrate({ rows: { meta: flat(50) }, periodEnd: '2026-09-28', currency: 'USD' });
    expect(totals('meta', 30).spend).toBe(1500);
    expect(totals('podcasts', 30).spend).toBe(0);
  });

  it('a SHORTER history is padded as "no data" -- a window reaching into it returns nothing, never zeros', () => {
    hydrate({ rows: { meta: flat(10).slice(0, 455) }, periodEnd: '2026-09-28', currency: 'USD' });
    expect(rowsFor('meta', 30)).toHaveLength(30);
    expect(rowsFor('meta', 30, 0, 365)).toHaveLength(30);        // last year: inside 455 days
    expect(rowsFor('meta', 90, 0, 365)).toHaveLength(90);
    expect(rowsFor('meta', 100, 0, 365)).toHaveLength(0);        // reaches before the data: nothing
    expect(hasWindow(30, 0, 365)).toBe(true);
    expect(hasWindow(100, 0, 365)).toBe(false);
  });

  it('refuses rows longer than the history the product holds', () => {
    expect(() => hydrate({ rows: { meta: [...flat(1), ...flat(1)] }, periodEnd: '2026-09-28', currency: 'USD' }))
      .toThrow(/at most 730 days/);
  });

  it('the seeded source reproduces the published figures exactly', () => {
    expect(Math.round(totals('all', 30).spend)).toBe(160780);
    expect(PERIOD_END.toISOString().slice(0, 10)).toBe('2026-08-12');
  });
});

describe('useDataSource -- real request state', () => {
  const net = (load: DataSource['load']): DataSource => ({ id: 'net', label: 'Network', load });

  it('a network source starts loading, then is ready', async () => {
    const src = net(() => Promise.resolve(fake()));
    const { result } = renderHook(() => useDataSource(src));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.account?.currency).toBe('EUR');
  });

  it('a failed request is the error state, with the reason', async () => {
    const src = net(() => Promise.reject(new Error('Token expired')));
    const { result } = renderHook(() => useDataSource(src));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Token expired');
  });

  it('an account with no spend at all is the empty state', async () => {
    const src = net(() => Promise.resolve(fake({}, 0)));
    const { result } = renderHook(() => useDataSource(src));
    await waitFor(() => expect(result.current.status).toBe('empty'));
  });

  it('the seeded source has data for the first paint -- no loading flash', () => {
    const { result } = renderHook(() => useDataSource(seededSource));
    expect(result.current.status).toBe('ready');
  });
});
