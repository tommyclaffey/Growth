import { useEffect, useState } from 'react';
import { Button } from '../Button/Button';
import { setPref, usePrefs } from '../../data/prefs';
import { useBackend } from '../../data/backend';
import {
  chooseMetaAccount, metaAccounts, metaStatus, type MetaStatus,
} from '../../data/sources/meta';

/**
 * Which data the whole product runs on -- the demo account, or a real Meta ad
 * account.
 *
 * Every state says what is true and what to do next, in order: no Meta app
 * yet → connect → choose an ad account → switch the product to it. Nothing here
 * pretends a step happened that did not.
 */
export function DataSourceCard() {
  const { dataSource } = usePrefs();
  const backend = useBackend();
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [accounts, setAccounts] = useState<{ id: string; name: string; currency: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backend === false) return;
    let live = true;
    void metaStatus().then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, [backend]);

  useEffect(() => {
    if (!status?.connected) return;
    let live = true;
    metaAccounts().then((a) => { if (live) setAccounts(a); }).catch((e) => { if (live) setError(String(e.message ?? e)); });
    return () => { live = false; };
  }, [status?.connected]);

  const step = backend === false ? 'static'
    : !status ? 'checking'
    : !status.configured ? 'no-app'
    : !status.connected || status.expired ? 'connect'
    : !status.accountId ? 'choose'
    : 'ready';

  return (
    <section className="gr-card">
      <header className="gr-card__header">
        <div className="gr-card__heading">
          <h3 className="gr-card__title gr-type-card-heading">Data source</h3>
          <p className="gr-card__sub gr-type-caption">
            What every screen, decision and answer is computed from.
          </p>
        </div>
      </header>

      <div className="gr-setting-row">
        <span className="gr-setting-row__text">
          <strong className="gr-type-body-medium">Demo account</strong>
          <span className="gr-type-caption">Northbank — seeded data, frozen on Aug 12, 2026</span>
        </span>
        {dataSource === 'seeded'
          ? <span className="gr-type-caption-med gr-source__on">In use</span>
          : <Button variant="ghost" onClick={() => setPref('dataSource', 'seeded')}>Use demo</Button>}
      </div>

      <div className="gr-setting-row">
        <span className="gr-setting-row__text">
          <strong className="gr-type-body-medium">Meta ad account</strong>
          <span className="gr-type-caption">
            {step === 'static' && 'Real accounts need the local build — this public demo has no server.'}
            {step === 'checking' && 'Checking…'}
            {step === 'no-app' && 'Needs a Meta app: add META_CLIENT_ID and META_CLIENT_SECRET to .env.local, then restart.'}
            {step === 'connect' && (status?.expired ? 'Your Meta sign-in expired. Connect again.' : 'Connect Meta to read the ad accounts you have a role on.')}
            {step === 'choose' && 'Connected. Choose the ad account to read.'}
            {step === 'ready' && `Connected to ${accounts?.find((a) => a.id === status?.accountId)?.name ?? status?.accountId}.`}
          </span>
          {error && <span className="gr-type-caption gr-source__error" role="alert">{error}</span>}
        </span>

        {step === 'connect' && (
          <a className="gr-setting-row__connect is-primary gr-type-caption" href="/api/connect/meta">Connect Meta</a>
        )}
        {(step === 'choose' || step === 'ready') && accounts && accounts.length > 0 && (
          <select
            className="gr-table__select gr-type-label-button"
            aria-label="Meta ad account"
            value={status?.accountId ?? ''}
            onChange={async (e) => {
              try {
                await chooseMetaAccount(e.target.value);
                setStatus((s) => (s ? { ...s, accountId: e.target.value } : s));
                setError(null);
              } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
            }}
          >
            {!status?.accountId && <option value="">Choose…</option>}
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </select>
        )}
        {step === 'ready' && (dataSource === 'meta'
          ? <span className="gr-type-caption-med gr-source__on">In use</span>
          : <Button variant="primary" onClick={() => setPref('dataSource', 'meta')}>Use Meta</Button>)}
      </div>
    </section>
  );
}
