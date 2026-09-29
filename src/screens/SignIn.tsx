import { useState, type FormEvent } from 'react';
import './SignIn.css';
import { Button } from '../components/Button/Button';
import { FormField } from '../components/FormField/FormField';
import { SlackMark } from '../components/SlackMark/SlackMark';
import { signIn, signUp, startProvider, type Provider } from '../data/auth';
import googleG from '../assets/brand/google-g.svg';
import microsoftMark from '../assets/brand/microsoft.svg';
import teamsMark from '../assets/brand/microsoft-teams.svg';

/**
 * Signing in to Growth.
 *
 * Five ways in, one account. Providers first, because most teams already live
 * in one of them; email underneath for everyone else.
 *
 * All four providers always show (Tommy, Sept 29: the choice of ways in is
 * part of the product, not an accident of which keys this server has). One not
 * switched on yet still has to DO something honest when pressed:
 *   - the owner setting up, on this machine -> the setup page with the exact
 *     steps for that provider
 *   - anyone else -> says the owner has not switched it on yet
 * Never a silent dead button.
 *
 * 🛑 Logos are the providers' own files, used as shipped: Google's hosted "G",
 * Microsoft's symbol, Microsoft's Teams icon, Slack's mark. Scaled, never
 * altered.
 */

const PROVIDERS: { key: Provider; label: string; mark: React.ReactNode }[] = [
  { key: 'google', label: 'Continue with Google', mark: <img src={googleG} alt="" width={18} height={18} /> },
  { key: 'slack', label: 'Continue with Slack', mark: <SlackMark size={18} /> },
  { key: 'microsoft', label: 'Continue with Microsoft', mark: <img src={microsoftMark} alt="" width={18} height={18} /> },
  { key: 'teams', label: 'Continue with Microsoft Teams', mark: <img src={teamsMark} alt="" width={20} height={20} /> },
];

export interface SignInProps {
  providers: Record<Provider, boolean>;
  /** No accounts exist yet: this one becomes the owner. */
  firstRun: boolean;
  /** First run AND on this machine -- the only place the owner can be created. */
  canCreateOwner: boolean;
}

export function SignIn({ providers, firstRun, canCreateOwner }: SignInProps) {
  const [mode, setMode] = useState<'in' | 'up'>(firstRun ? 'up' : 'in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);

  function choose(p: (typeof PROVIDERS)[number]) {
    if (providers[p.key] || canCreateOwner) { startProvider(p.key); return; }
    setNotice(`${p.label.replace('Continue with ', '')} sign-in isn’t switched on for this Growth yet. Ask the owner to turn it on, or use email.`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = mode === 'in' ? await signIn(email, password) : await signUp(name, email, password);
    setBusy(false);
    if (!r.ok) setError(r.error ?? 'That did not work. Try again.');
  }

  /* First run, reached through the tunnel: nobody can be the owner from here,
     and saying so beats a form that will refuse. */
  if (firstRun && !canCreateOwner) {
    return (
      <main className="gr-signin">
        <section className="gr-signin__card gr-card">
          <Lockup />
          <h1 className="gr-type-page-title">Growth isn’t set up yet</h1>
          <p className="gr-type-body gr-signin__lede">
            The first account has to be created on the computer running Growth. Open it there, at localhost, to set it up.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="gr-signin">
      <section className="gr-signin__card gr-card" aria-labelledby="signin-title">
        <Lockup />
        <div className="gr-signin__head">
          <h1 id="signin-title" className="gr-type-page-title">
            {firstRun ? 'Set up Growth' : mode === 'in' ? 'Sign in to Growth' : 'Create your account'}
          </h1>
          <p className="gr-type-body gr-signin__lede">
            {firstRun
              ? 'You’re the first one here, so this account will own this Growth.'
              : mode === 'in' ? 'Welcome back.' : 'Your email has to be on the owner’s invite list.'}
          </p>
        </div>

        <div className="gr-signin__providers">
          {PROVIDERS.map((p) => (
            <button key={p.key} type="button" className="gr-signin__provider gr-type-label-button"
                    onClick={() => choose(p)}>
              <span className="gr-signin__mark" aria-hidden="true">{p.mark}</span>
              {p.label}
            </button>
          ))}
          {notice && <p className="gr-type-caption gr-signin__notice" role="status">{notice}</p>}
        </div>
        <div className="gr-signin__or gr-type-caption" role="separator">or use email</div>

        <form className="gr-signin__form" onSubmit={submit} noValidate>
          {mode === 'up' && (
            <FormField label="Your name" value={name} onChange={setName} autoComplete="name" />
          )}
          <FormField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
          <FormField
            label="Password" type="password" value={password} onChange={setPassword}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            hint={mode === 'up' ? 'At least 10 characters.' : undefined}
          />
          {error && <p className="gr-type-caption gr-signin__error" role="alert">{error}</p>}
          <Button type="submit" variant="primary" className="gr-signin__submit" disabled={busy}>
            {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : firstRun ? 'Create owner account' : 'Create account'}
          </Button>
        </form>

        {!firstRun && (
          <p className="gr-type-caption gr-signin__switch">
            {mode === 'in' ? 'New here? ' : 'Already have an account? '}
            <button type="button" className="gr-signin__link gr-type-caption-med"
                    onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null); }}>
              {mode === 'in' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        )}
      </section>
    </main>
  );
}

/** Growth's own lockup -- the same mark and wordmark as the sidebar. */
function Lockup() {
  return (
    <div className="gr-signin__lockup">
      <span className="gr-sidebar__mark" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path d="M1 10L5 6L8 9L13 3" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="gr-sidebar__wordmark gr-type-brand">GROWTH</span>
    </div>
  );
}
