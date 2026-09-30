// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { setPref } from '../data/prefs';
import { normalizeMeta } from '../data/sources/metaNormalize';
import { compact } from '../data/sources/wire';
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

describe('real ad sets and ads -- never the demo’s invented ones', () => {
  const adPayload = normalizeMeta({
    account: { name: 'Acme Ads', currency: 'USD', timezone_name: 'America/Detroit' },
    campaigns: [{ id: '1', name: 'Spring Leads — Broad', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' }],
    adsets: [{ id: 's1', name: 'Broad — Detroit 25-54', campaign_id: '1', effective_status: 'ACTIVE' }],
    ads: [{ id: 'a1', name: 'Ad 1', adset_id: 's1', campaign_id: '1', effective_status: 'ACTIVE',
      creative: { title: 'Real headline from Meta', body: 'Real body copy.' } }],
    insights: Array.from({ length: 30 }, (_, i) => ({
      campaign_id: '1', adset_id: 's1', ad_id: 'a1',
      date_start: new Date(Date.UTC(2026, 8, 28 - i)).toISOString().slice(0, 10),
      spend: '150', impressions: '15000', clicks: '300', actions: [{ action_type: 'lead', value: '6' }],
    })),
    now: new Date('2026-09-29T15:00:00Z'), days: 180,
  });

  it('⭐ the campaign page and the Ads screen show the account’s real ad sets and ads', async () => {
    vi.stubGlobal('fetch', respond('/api/meta/data', adPayload));
    setPref('dataSource', 'meta');
    window.history.replaceState(null, '', '/?v=campaigns&p=meta-1');
    const { container, unmount } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain('Real headline from Meta'));
    expect(container.textContent).toContain('Broad — Detroit 25-54');
    /* The generator's copy must be nowhere. */
    expect(container.textContent).not.toMatch(/Join 400,000 people|Start free, no card|Set up in under three minutes/);
    unmount();

    window.history.replaceState(null, '', '/?v=ads');
    const ads = render(<App />);
    await waitFor(() => expect(ads.container.textContent).toContain('Real headline from Meta'));
    expect(ads.container.textContent).not.toMatch(/Join 400,000 people/);
  });

  it('⭐ the COMPACT wire format (what the server now sends) renders the same account', async () => {
    vi.stubGlobal('fetch', respond('/api/meta/data', compact(adPayload)));
    setPref('dataSource', 'meta');
    window.history.replaceState(null, '', '/?v=campaigns&p=meta-1');
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain('Real headline from Meta'));
    expect(container.textContent).toContain('Broad — Detroit 25-54');
  });
});
