import { useEffect, useState } from 'react';
import { Button } from '../Button/Button';
import { setPref, usePrefs, type Prefs } from '../../data/prefs';
import { useBackend } from '../../data/backend';
import { chooseMetaAccount, metaAccounts, metaStatus } from '../../data/sources/meta';
import {
  chooseGoogleAccount, formatCustomerId, googleAccounts, googleStatus,
} from '../../data/sources/google';

/**
 * Which data the whole product runs on -- the demo account, or a real Meta or
 * Google Ads account.
 *
 * Every state says what is true and what to do next, in order: no app yet →
 * connect → choose an account → switch the product to it. Nothing here
 * pretends a step happened that did not.
 */

interface Status {
  configured: boolean;
  /** Retired by Google on Sept 9, 2026. Still in older servers' replies; ignored. */
  developerToken?: boolean;
  connected: boolean;
  expired: boolean;
  /** Meta only: days until the long-lived token runs out. */
  expiresInDays?: number | null;
  accountId: string | null;
}
interface Choice { id: string; name: string; currency: string }

interface Platform<A extends Choice> {
  pref: Exclude<Prefs['dataSource'], 'seeded'>;
  name: string;           // "Meta ad account"
  short: string;          // "Meta"
  connectHref: string;
  missingApp: string;
  status: () => Promise<Status | null>;
  accounts: () => Promise<A[]>;
  choose: (a: A) => Promise<void>;
  show: (a: A) => string;
}

const META: Platform<Choice> = {
  pref: 'meta',
  name: 'Meta ad account',
  short: 'Meta',
  connectHref: '/api/connect/meta',
  missingApp: 'Needs a Meta app: add META_CLIENT_ID and META_CLIENT_SECRET to .env.local, then restart.',
  status: metaStatus,
  accounts: metaAccounts,
  choose: (a) => chooseMetaAccount(a.id),
  show: (a) => `${a.name} (${a.currency})`,
};

const GOOGLE: Platform<Awaited<ReturnType<typeof googleAccounts>>[number]> = {
  pref: 'google',
  name: 'Google Ads account',
  short: 'Google Ads',
  connectHref: '/api/connect/paidSearch',
  missingApp: 'Needs a Google OAuth client: add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart.',
  status: googleStatus,
  accounts: googleAccounts,
  choose: chooseGoogleAccount,
  show: (a) => `${a.name} · ${formatCustomerId(a.id)} (${a.currency})`,
};

function PlatformRow<A extends Choice>({ p }: { p: Platform<A> }) {
  const { dataSource } = usePrefs();
  const backend = useBackend();
  const [status, setStatus] = useState<Status | null>(null);
  const [accounts, setAccounts] = useState<A[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (backend === false) return;
    let live = true;
    void p.status().then((s) => { if (live) setStatus(s); });
    return () => { live = false; };
  }, [backend, p]);

  const canList = Boolean(status?.connected && !status.expired);
  useEffect(() => {
    if (!canList) return;
    let live = true;
    p.accounts().then((a) => { if (live) setAccounts(a); }).catch((e) => { if (live) setError(String(e.message ?? e)); });
    return () => { live = false; };
  }, [canList, p]);

  const step = backend === false ? 'static'
    : !status ? 'checking'
    : !status.configured ? 'no-app'
    : !status.connected || status.expired ? 'connect'
    : !status.accountId ? 'choose'
    : 'ready';

  const current = accounts?.find((a) => a.id === status?.accountId);
  const label = p.name;

  return (
    <div className="gr-setting-row">
      <span className="gr-setting-row__text">
        <strong className="gr-type-body-medium">{p.name}</strong>
        <span className="gr-type-caption">
          {step === 'static' && 'Connects on a real account. The demo runs on sample data.'}
          {step === 'checking' && 'Checking…'}
          {step === 'no-app' && p.missingApp}
          {step === 'connect' && (status?.expired ? `Your ${p.short} sign-in expired. Connect again.` : `Connect ${p.short} to read the accounts you have access to.`)}
          {step === 'choose' && 'Connected. Choose the account to read.'}
          {step === 'ready' && `Connected to ${current?.name ?? status?.accountId}.`}
          {step === 'ready' && typeof status?.expiresInDays === 'number' && status.expiresInDays < 7 && (
            ` Sign-in ends in ${status.expiresInDays === 0 ? 'less than a day' : `${status.expiresInDays} day${status.expiresInDays === 1 ? '' : 's'}`}. Connect again to renew it.`
          )}
        </span>
        {error && <span className="gr-type-caption gr-source__error" role="alert">{error}</span>}
      </span>

      {step === 'connect' && (
        <a className="gr-setting-row__connect is-primary gr-type-caption" href={p.connectHref}>Connect {p.short}</a>
      )}
      {(step === 'choose' || step === 'ready') && accounts && accounts.length > 0 && (
        <select
          className="gr-table__select gr-type-label-button"
          aria-label={label}
          value={status?.accountId ?? ''}
          onChange={async (e) => {
            const a = accounts.find((x) => x.id === e.target.value);
            if (!a) return;
            try {
              await p.choose(a);
              setStatus((s) => (s ? { ...s, accountId: a.id } : s));
              setError(null);
            } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
          }}
        >
          {!status?.accountId && <option value="">Choose…</option>}
          {accounts.map((a) => <option key={a.id} value={a.id}>{p.show(a)}</option>)}
        </select>
      )}
      {(step === 'choose' || step === 'ready') && accounts && accounts.length === 0 && (
        <span className="gr-type-caption">No accounts found for this sign-in.</span>
      )}
      {step === 'ready' && (dataSource === p.pref
        ? <span className="gr-type-caption-med gr-source__on">In use</span>
        : <Button variant="primary" onClick={() => setPref('dataSource', p.pref)}>Use {p.short}</Button>)}
    </div>
  );
}

export function DataSourceCard() {
  const { dataSource } = usePrefs();
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

      <PlatformRow p={META} />
      <PlatformRow p={GOOGLE} />
    </section>
  );
}
