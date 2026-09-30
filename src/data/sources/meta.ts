import type { DataSource } from '../source';
import { fromWire } from './wire';

/**
 * A connected Meta ad account, as a data source.
 *
 * The whole integration from the product's side: fetch, and let hydrate() and
 * applyStructure() do the rest. The mapping from Meta's shapes lives in
 * metaNormalize.ts, on the server. No `initial` -- a network source starts in
 * the loading state rather than flashing demo numbers it is about to replace.
 */
export const metaSource: DataSource = {
  id: 'meta',
  label: 'Meta ad account',
  async load(signal) {
    const r = await fetch('/api/meta/data', { signal });
    const body = await r.json().catch(() => ({ error: `Meta returned ${r.status}` }));
    if (!r.ok) throw new Error((body as { error?: string }).error ?? `Meta returned ${r.status}`);
    return fromWire(body);   // compact on the wire -- see wire.ts
  },
};

export interface MetaStatus {
  configured: boolean;
  connected: boolean;
  expired: boolean;
  accountId: string | null;
}

export async function metaStatus(): Promise<MetaStatus | null> {
  try {
    const r = await fetch('/api/meta/status');
    return r.ok ? (await r.json()) as MetaStatus : null;
  } catch { return null; }
}

export async function metaAccounts(): Promise<{ id: string; name: string; currency: string }[]> {
  const r = await fetch('/api/meta/accounts');
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? 'Could not list ad accounts.');
  return body.accounts;
}

export async function chooseMetaAccount(id: string): Promise<void> {
  const r = await fetch('/api/meta/account', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? 'Could not choose that account.');
}
