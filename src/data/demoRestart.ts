import { refreshAuth } from './auth';

/**
 * Nov 7, Tommy: "have all my demo restart after a refresh."
 *
 * The demo keeps what a visitor changes in this browser (decisions, chats,
 * reports, the welcome card). A refresh on the demo clears it and goes back to
 * the first screen. Runs before the app is even loaded, because some of those
 * stores read at import. Only for the demo: the public site, or a sandboxed
 * demo session. A real account's data is never touched, and a server that can't
 * be reached doesn't count as the demo (an installed app offline would lose it).
 */
export async function restartDemoIfRefreshed(): Promise<void> {
  const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  // Inside another page's frame (the portfolio's viewer) a refresh of that page reports "navigate", so every load there counts.
  if (nav?.type !== 'reload' && window.self === window.top) return;
  const s = await refreshAuth();
  const demo = location.hostname.endsWith('github.io') || (s.status === 'signed-in' && Boolean(s.user.sandboxed));
  if (!demo) return;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('growth.') && k !== 'growth.theme') localStorage.removeItem(k);
    }
  } catch { /* private mode: nothing was saved anyway */ }
  window.history.replaceState(null, '', import.meta.env.BASE_URL);
}
