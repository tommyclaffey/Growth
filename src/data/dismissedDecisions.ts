import { useSyncExternalStore } from 'react';

/**
 * Decisions the user has dismissed, and why.
 *
 * ⭐ The reason is not optional decoration — it is the only signal this feature
 * gets about whether it is any good. A dismissal with no reason tells you a card
 * was unwanted; a dismissal that says *"we already tried this"* or *"that channel
 * is a brand play, not a lead play"* tells you which KIND of candidate to stop
 * surfacing. One is noise, the other is feedback.
 *
 * ⚠️ Keyed by candidate id, which is derived from the finding rather than from a
 * position in a list. So dismissing *"pause this ad"* stays dismissed when the
 * ranking reshuffles, and does NOT suppress a different finding that happens to
 * land in the same slot tomorrow.
 *
 * Dismissal is reversible, because G-001 settled that every state change here has
 * to be — and a queue you can permanently delete from without recourse is one
 * people stop trusting themselves to use.
 */

export interface Dismissal {
  id: string;
  reason: string;
  at: number;
}

const KEY = 'growth.dismissed-decisions';
const CHANGED = 'growth:dismissed-decisions';

function read(): Dismissal[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!Array.isArray(raw)) return [];
    /* Entry by entry, so one bad record cannot discard the rest. */
    return raw.filter((d: unknown): d is Dismissal => {
      if (!d || typeof d !== 'object') return false;
      const x = d as Partial<Dismissal>;
      return typeof x.id === 'string' && typeof x.reason === 'string'
        && typeof x.at === 'number';
    });
  } catch {
    return [];
  }
}

let cache: Dismissal[] = read();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function dismissals(): Dismissal[] {
  return cache;
}

export function isDismissed(id: string): boolean {
  return cache.some((d) => d.id === id);
}

export function dismiss(id: string, reason: string) {
  if (cache.some((d) => d.id === id)) return;       // idempotent
  cache = [{ id, reason, at: Date.now() }, ...cache];
  save();
}

export function restore(id: string) {
  if (!cache.some((d) => d.id === id)) return;
  cache = cache.filter((d) => d.id !== id);
  save();
}

/* Memoised: useSyncExternalStore compares snapshots by reference, so returning a
   fresh array from getSnapshot re-renders forever. */
function subscribe(fn: () => void) {
  const sync = () => { cache = read(); fn(); };
  window.addEventListener(CHANGED, fn);
  window.addEventListener('storage', sync);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('storage', sync);
  };
}

export function useDismissals(): Dismissal[] {
  return useSyncExternalStore(subscribe, dismissals);
}
