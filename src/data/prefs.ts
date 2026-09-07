import { useSyncExternalStore } from 'react';

/**
 * Notification preferences, and which alerts have been read.
 *
 * These were five `useState` calls in Settings and one in Notifications, next
 * to three neighbours that genuinely persisted. Every one of them reset on
 * navigation, so the app asked how you wanted to be notified, appeared to
 * accept the answer, and discarded it the moment you left the screen.
 *
 * ⚠️ Persisting a switch is not the same as honouring it. Two of these now
 * drive real behaviour -- `cacAlerts` and `pacing` gate the matching alerts on
 * Overview -- and the digest fields cannot, because sending mail needs a server
 * this build does not have. The Settings screen says so rather than implying a
 * daily email is on its way.
 */
export interface Prefs {
  cacAlerts: boolean;
  pacing: boolean;
  digest: boolean;
  digestTo: string;
  /** Alert ids marked read. Ids, not a count, so it survives the list changing. */
  readAlerts: string[];
  /**
   * Overview alerts that have been ADDRESSED and dismissed.
   *
   * Separate from readAlerts on purpose: reading a notification means you have
   * seen it, dismissing the strip means you have dealt with it. Collapsing the
   * two would have opening the Notifications screen silently clear the thing
   * still telling you your CAC is up 42%.
   */
  dismissedAlerts: string[];
}

const KEY = 'growth.prefs';
const CHANGED = 'growth:prefs';

export const DEFAULT_PREFS: Prefs = {
  cacAlerts: true,
  pacing: false,
  digest: true,
  digestTo: 'growth@example.com',
  readAlerts: [],
  dismissedAlerts: [],
};

/* Validated field by field rather than trusting the shape.

   localStorage is editable by anyone with devtools and survives across
   deploys, so a value written by an older build is untrusted input. A single
   bad field falls back to its default instead of discarding the whole object,
   which is what a blanket try/catch around JSON.parse would do. */
function read(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFS };
    const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
    return {
      cacAlerts: bool(raw.cacAlerts, DEFAULT_PREFS.cacAlerts),
      pacing: bool(raw.pacing, DEFAULT_PREFS.pacing),
      digest: bool(raw.digest, DEFAULT_PREFS.digest),
      digestTo: typeof raw.digestTo === 'string' ? raw.digestTo : DEFAULT_PREFS.digestTo,
      readAlerts: Array.isArray(raw.readAlerts)
        ? raw.readAlerts.filter((x: unknown): x is string => typeof x === 'string')
        : [],
      dismissedAlerts: Array.isArray(raw.dismissedAlerts)
        ? raw.dismissedAlerts.filter((x: unknown): x is string => typeof x === 'string')
        : [],
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let cache: Prefs = read();

/* Held outside React so Settings, Notifications and the Overview alert strip
   read one value. Three components each holding their own copy is how the
   campaign status pill came to disagree with the campaign table. */
export function prefs(): Prefs {
  return cache;
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  if (cache[key] === value) return;
  cache = { ...cache, [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* private mode or quota — the session still works, it just forgets */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function markAllRead(ids: string[]) {
  setPref('readAlerts', [...new Set([...cache.readAlerts, ...ids])]);
}

export function isRead(id: string): boolean {
  return cache.readAlerts.includes(id);
}

export function dismissAlert(id: string) {
  if (cache.dismissedAlerts.includes(id)) return;
  setPref('dismissedAlerts', [...cache.dismissedAlerts, id]);
}

export function dismissAll(ids: string[]) {
  setPref('dismissedAlerts', [...new Set([...cache.dismissedAlerts, ...ids])]);
}

/* The way back.

   Dismissals persist, so without this the strip is gone for good the first
   time someone clears it -- a one-way door, and the feature then looks broken
   rather than done. Lives in Settings beside the alert switches, which is
   where alert behaviour is already configured. */
export function restoreAlerts() {
  setPref('dismissedAlerts', []);
}

function subscribe(fn: () => void) {
  window.addEventListener(CHANGED, fn);
  /* A second tab is a second copy of this cache. Without this, changing a
     preference in one tab leaves the other showing the old value while
     localStorage already holds the new one. */
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = read(); fn(); }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, prefs, () => DEFAULT_PREFS);
}
