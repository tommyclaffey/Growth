import { useSyncExternalStore } from 'react';
import { CAMPAIGNS } from './campaigns';

/**
 * Attention that a PERSON assigned, as opposed to attention the data derived.
 *
 * ⚠️ This is the decision the whole feature turned on. "Needs attention" was
 * derived only -- the numbers said CAC rose 42%, so a pill appeared. Under that
 * model there is nothing to re-flag, because nobody flagged anything in the
 * first place; the strip was a readout, not a queue.
 *
 * Accepting assigned state makes it a queue: a person can put something on it
 * that the numbers have not noticed, and take it off when it is handled. The
 * two kinds live side by side and are visibly different, because "your CAC rose
 * 42%" and "Tommy flagged this on Tuesday" are not the same claim and should
 * never look like they are.
 */
export interface Flag {
  /** Stable and derived from the target, so flagging the same thing twice
      cannot produce two entries. */
  id: string;
  kind: 'campaign' | 'notification';
  refId: string;
  label: string;
  /** Epoch ms. Ordering only -- newest first. */
  at: number;
}

const KEY = 'growth.attention';
const CHANGED = 'growth:attention';

export function flagId(kind: Flag['kind'], refId: string) {
  return `${kind}:${refId}`;
}

/* Validated entry by entry. localStorage survives deploys and is editable in
   devtools, so a value written by an older build is untrusted input -- and one
   bad entry must not discard the rest of someone's queue. */
function read(): Flag[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!Array.isArray(raw)) return [];
    return raw.filter((f: unknown): f is Flag => {
      if (!f || typeof f !== 'object') return false;
      const x = f as Partial<Flag>;
      return typeof x.id === 'string' && typeof x.refId === 'string'
        && typeof x.label === 'string' && typeof x.at === 'number'
        && (x.kind === 'campaign' || x.kind === 'notification');
    });
  } catch {
    return [];
  }
}

let cache: Flag[] = read();

/* ⚠️ MEMOISED, and it has to be.

   useSyncExternalStore compares snapshots by REFERENCE. A getSnapshot that
   filters on every call returns a new array each time, React sees a changed
   snapshot on every render, and it re-renders forever. Recomputed only when
   the underlying list actually changes. */
let live: Flag[] = compute();

function compute(): Flag[] {
  return cache.filter((f) =>
    f.kind !== 'campaign' || CAMPAIGNS.some((c) => c.id === f.refId));
}

function save() {
  live = compute();
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function flags(): Flag[] {
  return cache;
}

export function isFlagged(kind: Flag['kind'], refId: string): boolean {
  return cache.some((f) => f.id === flagId(kind, refId));
}

export function addFlag(kind: Flag['kind'], refId: string, label: string) {
  const id = flagId(kind, refId);
  if (cache.some((f) => f.id === id)) return;      // idempotent
  cache = [{ id, kind, refId, label, at: Date.now() }, ...cache];
  save();
}

export function removeFlag(kind: Flag['kind'], refId: string) {
  const id = flagId(kind, refId);
  if (!cache.some((f) => f.id === id)) return;
  cache = cache.filter((f) => f.id !== id);
  save();
}

/** Flag or unflag in one call, for a control that toggles. */
export function toggleFlag(kind: Flag['kind'], refId: string, label: string) {
  if (isFlagged(kind, refId)) removeFlag(kind, refId);
  else addFlag(kind, refId, label);
}

/**
 * Restores a flag that was just cleared, label and all.
 *
 * `at` is deliberately NOT restored: an item put back on the queue is on it
 * now, not at the time it was first raised. Keeping the original timestamp
 * would sort a just-restored item to the bottom, where the person who restored
 * it would never see it.
 */
export function restoreFlag(f: Flag) {
  if (cache.some((x) => x.id === f.id)) return;
  cache = [{ ...f, at: Date.now() }, ...cache];
  save();
}

/* A flag pointing at a campaign that no longer exists is dead weight. Filtered
   rather than deleted, so a campaign temporarily missing from the seed data
   does not permanently destroy someone's queue. */
export function liveFlags(): Flag[] {
  return live;
}

function subscribe(fn: () => void) {
  window.addEventListener(CHANGED, fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) { cache = read(); live = compute(); fn(); }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function useFlags(): Flag[] {
  return useSyncExternalStore(subscribe, liveFlags, () => []);
}
