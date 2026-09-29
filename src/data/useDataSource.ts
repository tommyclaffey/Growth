import { useEffect, useState } from 'react';
import { hydrate } from './metrics';
import { applyStructure } from './structure';
import { syncChannels } from './channels';
import type { Account, DataSource } from './source';

export type SourceStatus = 'loading' | 'ready' | 'error' | 'empty';

export interface SourceState {
  status: SourceStatus;
  account?: Account;
  error?: string;
}

/** True when a source returned no activity at all -- a new or idle account. */
function isEmpty(rows: Record<string, { spend: number }[] | undefined>): boolean {
  return Object.values(rows).every((r) => !r || r.every((d) => d.spend === 0));
}

/**
 * Load a data source into the product, with REAL request state.
 *
 * ⭐ The loading, error and empty states were built long ago and reachable only
 * through Settings → Simulate state, because the data could not be slow or fail.
 * Now they are driven by an actual request; the simulator stays as a second
 * way in, for looking at them on the demo account.
 */
export function useDataSource(source: DataSource): SourceState {
  const [state, setState] = useState<SourceState>(() => {
    if (!source.initial) return { status: 'loading' };
    hydrate({ rows: source.initial.rows, periodEnd: source.initial.account.periodEnd, currency: source.initial.account.currency });
    applyStructure(source.initial.campaigns);
    syncChannels(false);
    return {
      status: isEmpty(source.initial.rows) ? 'empty' : 'ready',
      account: source.initial.account,
    };
  });

  useEffect(() => {
    /* A source with data in hand applies it straight away -- switching back to
       the demo is instant, not a round trip. */
    if (source.initial) {
      hydrate({ rows: source.initial.rows, periodEnd: source.initial.account.periodEnd, currency: source.initial.account.currency });
      applyStructure(source.initial.campaigns);
    syncChannels();
      setState({ status: isEmpty(source.initial.rows) ? 'empty' : 'ready', account: source.initial.account });
      return;
    }
    setState({ status: 'loading' });
    const ctrl = new AbortController();
    source.load(ctrl.signal)
      .then((d) => {
        if (ctrl.signal.aborted) return;
        hydrate({ rows: d.rows, periodEnd: d.account.periodEnd, currency: d.account.currency });
        applyStructure(d.campaigns);
        syncChannels();
        setState({ status: isEmpty(d.rows) ? 'empty' : 'ready', account: d.account });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      });
    return () => ctrl.abort();
  }, [source]);

  return state;
}
