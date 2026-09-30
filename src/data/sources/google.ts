import type { DataSource } from '../source';
import { fromWire } from './wire';

/**
 * A connected Google Ads account, as a data source. Same shape as metaSource:
 * fetch, and let hydrate() and applyStructure() do the rest. The mapping from
 * Google's shapes lives in googleNormalize.ts, on the server.
 */
export const googleSource: DataSource = {
  id: 'google',
  label: 'Google Ads account',
  async load(signal) {
    const r = await fetch('/api/google/data', { signal });
    const body = await r.json().catch(() => ({ error: `Google Ads returned ${r.status}` }));
    if (!r.ok) throw new Error((body as { error?: string }).error ?? `Google Ads returned ${r.status}`);
    return fromWire(body);   // compact on the wire -- see wire.ts
  },
};

export interface GoogleStatus {
  configured: boolean;
  /** GOOGLE_ADS_DEVELOPER_TOKEN is set -- the credential Meta does not need. */
  developerToken: boolean;
  connected: boolean;
  expired: boolean;
  accountId: string | null;
}

export interface GoogleAccountChoice { id: string; name: string; currency: string; loginCustomerId: string }

export async function googleStatus(): Promise<GoogleStatus | null> {
  try {
    const r = await fetch('/api/google/status');
    return r.ok ? (await r.json()) as GoogleStatus : null;
  } catch { return null; }
}

export async function googleAccounts(): Promise<GoogleAccountChoice[]> {
  const r = await fetch('/api/google/accounts');
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? 'Could not list Google Ads accounts.');
  return body.accounts;
}

export async function chooseGoogleAccount(a: GoogleAccountChoice): Promise<void> {
  const r = await fetch('/api/google/account', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: a.id, loginCustomerId: a.loginCustomerId }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'Could not choose that account.');
}

/** "1234567890" → "123-456-7890", the way Google Ads shows customer ids. */
export const formatCustomerId = (id: string) => id.replace(/^(\d{3})(\d{3})(\d+)$/, '$1-$2-$3');
