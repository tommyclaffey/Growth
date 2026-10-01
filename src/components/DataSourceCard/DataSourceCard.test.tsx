// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DataSourceCard } from './DataSourceCard';
import { setPref } from '../../data/prefs';

/* The local build: the dev-server API is reachable. */
vi.mock('../../data/backend', () => ({ useBackend: () => true, probeBackend: async () => true }));

afterEach(() => {
  cleanup();
  setPref('dataSource', 'seeded');
  localStorage.clear();
  vi.unstubAllGlobals();
});

const respond = (routes: Record<string, unknown>) => vi.fn((input: RequestInfo | URL) => {
  const hit = Object.keys(routes).find((u) => String(input).includes(u));
  return hit
    ? Promise.resolve(new Response(JSON.stringify(routes[hit]), { status: 200, headers: { 'content-type': 'application/json' } }))
    : Promise.reject(new Error('offline'));
});

describe('Settings → Data source, Google row', () => {
  const meta = { configured: false, connected: false, expired: false, accountId: null };

  it('⚠️ asks for no developer token -- Google retired them Sept 9, 2026', async () => {
    /* Even an older server still reporting developerToken:false gets Connect. */
    vi.stubGlobal('fetch', respond({
      '/api/meta/status': meta,
      '/api/google/status': { configured: true, developerToken: false, connected: false, expired: false, accountId: null },
    }));
    render(<DataSourceCard />);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Connect Google Ads' })).toBeTruthy());
    expect(screen.queryByText(/GOOGLE_ADS_DEVELOPER_TOKEN/)).toBeNull();
  });

  it('a Meta sign-in ending within a week says so, with the way to renew it', async () => {
    vi.stubGlobal('fetch', respond({
      '/api/meta/status': { configured: true, connected: true, expired: false, expiresInDays: 3, accountId: 'act_1' },
      '/api/meta/accounts': { accounts: [{ id: 'act_1', name: 'Northbank', currency: 'USD' }] },
      '/api/google/status': { configured: false, connected: false, expired: false, accountId: null },
    }));
    render(<DataSourceCard />);
    await waitFor(() => expect(screen.getByText(/Sign-in ends in 3 days\. Connect again to renew it\./)).toBeTruthy());
  });

  it('connected: lists accounts with Google’s dashed ids, and switches the product on choosing', async () => {
    vi.stubGlobal('fetch', respond({
      '/api/meta/status': meta,
      '/api/google/status': { configured: true, developerToken: true, connected: true, expired: false, accountId: '1234567890' },
      '/api/google/accounts': { accounts: [{ id: '1234567890', name: 'Acme Search', currency: 'USD', loginCustomerId: '1234567890' }] },
    }));
    render(<DataSourceCard />);
    await waitFor(() => expect(screen.getByText('Acme Search · 123-456-7890 (USD)')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Use Google Ads' }));
    await waitFor(() => expect(screen.getAllByText('In use').length).toBe(1));
  });
});
