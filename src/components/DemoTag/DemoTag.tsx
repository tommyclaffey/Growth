import './DemoTag.css';
import { useAuth } from '../../data/auth';

/** True on the sample company: the demo account, or the static public demo. */
export function useIsDemo(): boolean {
  const auth = useAuth();
  return auth.status === 'no-server' || (auth.status === 'signed-in' && Boolean(auth.user.demo));
}

/**
 * DEMO, beside the logo -- the same small pill Queue wears (Tommy, Oct 7).
 *
 * Someone opening the shared /demo link should know at a glance that
 * Northbank is a sample company, before they wonder whose money this is.
 * Never shown on a real account.
 */
export function DemoTag({ className }: { className?: string }) {
  if (!useIsDemo()) return null;
  return (
    <span
      className={['gr-demo-tag', 'gr-type-micro', className].filter(Boolean).join(' ')}
      title="Sample company and data. Nothing here touches a real ad account."
    >
      Demo
    </span>
  );
}
