// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { setPref } from '../data/prefs';
import { normalizeMeta } from '../data/sources/metaNormalize';
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

/* What /api/meta/data returns: the normaliser's output for a Graph response. */
const payload = normalizeMeta({
  account: { name: 'Acme Ads', currency: 'USD', timezone_name: 'America/Detroit' },
  campaigns: [{ id: '1', name: 'Spring Leads — Broad', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' }],
  insights: Array.from({ length: 30 }, (_, i) => ({
    campaign_id: '1', date_start: new Date(Date.UTC(2026, 8, 28 - i)).toISOString().slice(0, 10),
    spend: '200', impressions: '20000', clicks: '400', actions: [{ action_type: 'lead', value: '8' }],
  })),
  now: new Date('2026-09-29T15:00:00Z'), days: 180,
});

const respond = (url: string, body: unknown, status = 200) => vi.fn((input: RequestInfo | URL) =>
  String(input).includes(url)
    ? Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
    : Promise.reject(new Error('offline')));

describe('the product on a real Meta account', () => {
  it('⭐ Campaigns shows the account’s own campaigns, not the demo’s', async () => {
    vi.stubGlobal('fetch', respond('/api/meta/data', payload));
    setPref('dataSource', 'meta');
    window.history.replaceState(null, '', '/?v=campaigns');
    render(<App />);
    await waitFor(() => expect(screen.getAllByText('Spring Leads — Broad').length).toBeGreaterThan(0));
    expect(screen.queryByText('Advantage+ — Evergreen Signups')).toBeNull();
  });

  it('a failed load says why, and offers the way back', async () => {
    vi.stubGlobal('fetch', respond('/api/meta/data', { error: 'Error validating access token: session has expired' }, 401));
    setPref('dataSource', 'meta');
    render(<App />);
    const banner = await waitFor(() => screen.getByRole('alert'));
    expect(banner.textContent).toMatch(/session has expired/);
    fireEvent.click(screen.getByRole('button', { name: 'Use the demo account' }));
    await waitFor(() => expect(screen.queryByText(/session has expired/)).toBeNull());
  });
});
