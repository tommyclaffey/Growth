import { useEffect } from 'react';
import App from './App';
import { SignIn } from './screens/SignIn';
import { refreshAuth, useAuth } from './data/auth';

/**
 * Sign-in first, then the product.
 *
 * Kept OUT of App: App calls dozens of hooks, and returning early from it
 * before they run would change their order between renders. This decides which
 * tree to mount instead.
 *
 * The public demo has no server, so it lands on "no-server" and renders the
 * app exactly as before -- no login for visitors.
 */
export function Root() {
  const auth = useAuth();
  useEffect(() => { void refreshAuth(); }, []);

  /* Asking. Nothing rather than a flash of the app or of the sign-in screen --
     either would be a guess, and the answer takes one local request. */
  if (auth.status === 'checking') return null;
  if (auth.status === 'signed-out') {
    return <SignIn providers={auth.providers} firstRun={auth.firstRun} canCreateOwner={auth.canCreateOwner} canUseDemo={auth.canUseDemo} />;
  }
  return <App />;
}
