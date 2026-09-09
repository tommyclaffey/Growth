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

  /* ---- Task fields -------------------------------------------------------

     ⚠️ A task is a FLAG WITH FIELDS, not a second object.

     The alternative was a separate task store beside this one, and it would
     have drifted within a week: flag something, make it a task, clear the flag,
     and now there is an orphan task pointing at nothing. One record with
     optional fields cannot get out of step with itself.

     A flag says "this matters". Filling these in says "and someone owns it, by
     a date". Same thing, more detail. */

  /** Member id from MEMBERS. Undefined means flagged but unassigned. */
  owner?: string;
  /** ISO yyyy-mm-dd. Date only -- reminders need a backend, overdue does not. */
  due?: string;
}

/** True once any task field is set. A flag with an owner or a date is a task. */
export function isTask(f: Flag): boolean {
  return Boolean(f.owner || f.due);
}

/**
 * Overdue is computed, never stored.
 *
 * A stored `isOverdue` would be true from the moment it was written and would
 * stay true after the date moved, which is the exact shape of defect this
 * codebase keeps finding: a value reporting what was saved rather than what is
 * true.
 */
export function isOverdue(f: Flag, today = new Date()): boolean {
  if (!f.due) return false;
  const t = today.toISOString().slice(0, 10);
  return f.due < t;
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
      const base = typeof x.id === 'string' && typeof x.refId === 'string'
        && typeof x.label === 'string' && typeof x.at === 'number'
        && (x.kind === 'campaign' || x.kind === 'notification');
      /* Optional fields are validated only if present. A bad owner should not
         discard an otherwise good flag -- it should just not be assigned. */
      const okOwner = x.owner === undefined || typeof x.owner === 'string';
      const okDue = x.due === undefined || /^\d{4}-\d{2}-\d{2}$/.test(String(x.due));
      return base && okOwner && okDue;
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
/**
 * Set or clear the task fields on an existing flag.
 *
 * Assigning to something not yet flagged flags it first -- you cannot own a
 * thing that is not on the list, and making someone press two buttons to
 * express one intention is how features get called clunky.
 */
export function setTask(
  kind: Flag['kind'], refId: string, label: string,
  fields: { owner?: string | null; due?: string | null },
) {
  const id = flagId(kind, refId);
  if (!cache.some((f) => f.id === id)) addFlag(kind, refId, label);
  cache = cache.map((f) => {
    if (f.id !== id) return f;
    const next = { ...f };
    /* null clears, undefined leaves alone. Without that distinction there is no
       way to unassign an owner without also wiping the due date. */
    if (fields.owner !== undefined) {
      if (fields.owner === null) delete next.owner; else next.owner = fields.owner;
    }
    if (fields.due !== undefined) {
      if (fields.due === null) delete next.due; else next.due = fields.due;
    }
    return next;
  });
  save();
}

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

/**
 * A task is DONE when the campaign it is attached to has Ended.
 *
 * ⭐ Tommy's answer, and it beat both options originally written down. Not
 * closed by a person, which ignores what actually happened to the campaign.
 * Not closed by a metric recovering, which pretends a number can report that a
 * decision was taken.
 *
 * A person decided to end the campaign. Ending it IS the decision, and the task
 * follows it. The losing half of an A/B test gets switched off, and everything
 * outstanding against it is finished by definition.
 *
 * ⚠️ PAUSED IS NOT DONE. A paused campaign can come back, so its tasks stay
 * open. That distinction is the whole argument for reusing the existing Stage
 * vocabulary instead of inventing a parallel task status that would drift from
 * it -- Stage already knows the difference between "stopped for now" and
 * "over".
 */
export function isDone(f: Flag, stageOf: (id: string) => string): boolean {
  if (f.kind !== 'campaign') return false;
  return stageOf(f.refId) === 'Ended';
}

/** Open tasks only: flagged, and not closed by their campaign ending. */
export function openFlags(all: Flag[], stageOf: (id: string) => string): Flag[] {
  return all.filter((f) => !isDone(f, stageOf));
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
