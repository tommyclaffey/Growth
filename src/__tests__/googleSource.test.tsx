// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { setPref } from '../data/prefs';
import { normalizeGoogle, type GRow } from '../data/sources/googleNormalize';
import { hydrate } from '../data/metrics';
import { applyStructure } from '../data/structure';
import { seededSource } from '../data/sources/seeded';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  setPref('dataSource', 'seeded');
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
  applyStructure(undefined);
  localStorage.clear();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const day = (i: number) => new Date(Date.UTC(2026, 8, 28 - i)).toISOString().slice(0, 10);
const keys: Partial<GRow> = { campaign: { id: '1' }, adGroup: { id: '11' }, adGroupAd: { ad: { id: '111' } } };

/* What /api/google/data returns: the normaliser's output for searchStream rows. */
const payload = normalizeGoogle({
  customer: { descriptiveName: 'Acme Search', currencyCode: 'USD', timeZone: 'America/Detroit' },
  campaigns: [
    { campaign: { id: '1', name: 'Brand — Exact', status: 'ENABLED', advertisingChannelType: 'SEARCH' } },
    { campaign: { id: '2', name: 'YouTube — How it works', status: 'ENABLED', advertisingChannelType: 'VIDEO' } },
  ],
  adGroups: [{ campaign: { id: '1' }, adGroup: { id: '11', name: 'Brand terms', status: 'ENABLED' } }],
  ads: [{ ...keys, adGroupAd: { status: 'ENABLED', ad: { id: '111', type: 'RESPONSIVE_SEARCH_AD',
    responsiveSearchAd: { headlines: [{ text: 'Real headline from Google' }], descriptions: [{ text: 'Real description.' }] } } } }],
  metrics: Array.from({ length: 30 }, (_, i) => [
    { ...keys, segments: { date: day(i) }, metrics: { costMicros: '120000000', impressions: '4000', clicks: '300' } },
    { ...keys, segments: { date: day(i), conversionActionCategory: 'SUBMIT_LEAD_FORM' }, metrics: { conversions: 6 } },
    { campaign: { id: '2' }, segments: { date: day(i) }, metrics: { costMicros: '90000000', impressions: '30000', clicks: '90' } },
    { campaign: { id: '2' }, segments: { date: day(i), conversionActionCategory: 'SIGNUP' }, metrics: { conversions: 1 } },
  ]).flat() as GRow[],
  now: new Date('2026-09-29T15:00:00Z'), days: 180,
});

const respond = (routes: Record<string, unknown>) => vi.fn((input: RequestInfo | URL) => {
  const hit = Object.keys(routes).find((u) => String(input).includes(u));
  return hit
    ? Promise.resolve(new Response(JSON.stringify(routes[hit]), { status: 200, headers: { 'content-type': 'application/json' } }))
    : Promise.reject(new Error('offline'));
});

describe('the product on a real Google Ads account', () => {
  it('⭐ Campaigns shows the account’s own campaigns -- YouTube spend under YouTube', async () => {
    vi.stubGlobal('fetch', respond({ '/api/google/data': payload }));
    setPref('dataSource', 'google');
    window.history.replaceState(null, '', '/?v=campaigns');
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain('Brand — Exact'));
    expect(container.textContent).toContain('YouTube — How it works');
    expect(container.textContent).not.toContain('Advantage+ — Evergreen Signups');
  });

  it('⭐ a campaign opens on its real ad group and responsive search ad copy', async () => {
    vi.stubGlobal('fetch', respond({ '/api/google/data': payload }));
    setPref('dataSource', 'google');
    window.history.replaceState(null, '', '/?v=campaigns&p=google-1');
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain('Real headline from Google'));
    expect(container.textContent).toContain('Brand terms');
    expect(container.textContent).not.toMatch(/Join 400,000 people/);
  });

  it('a failed load names Google Ads and offers the way back', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
      JSON.stringify({ error: 'Your Google Ads developer token is approved for test accounts only.' }), { status: 502 }))));
    setPref('dataSource', 'google');
    render(<App />);
    const banner = await waitFor(() => screen.getByRole('alert'));
    expect(banner.textContent).toMatch(/Couldn.t load your Google Ads data/);
    expect(banner.textContent).toMatch(/test accounts only/);
    fireEvent.click(screen.getByRole('button', { name: 'Use the demo account' }));
    await waitFor(() => expect(screen.queryByText(/test accounts only/)).toBeNull());
  });
});
