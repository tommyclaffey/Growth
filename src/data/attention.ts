import { useSyncExternalStore } from 'react';
import { CAMPAIGNS } from './campaigns';
import type { Baseline } from './grading';

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
  /**
   * What the flag points at.
   *
   * ⭐ `'decision'` is the third SOURCE of attention, and it lands here rather
   * than in a new store for the reason this file already argues about tasks: one
   * record with optional fields cannot get out of step with itself, and a
   * parallel store would drift within a week.
   *
   * G-001 established that the queue accepts attention the DATA derived and
   * attention a PERSON assigned, rendered differently because *"your CAC rose
   * 42%"* and *"you flagged this Tuesday"* are not the same claim. A decision the
   * ENGINE proposed is a third such claim — *"Growth thinks you should move
   * $8k"* — and it must not wear either of the other two costumes.
   *
   * `refId` for a decision is the candidate id, not a campaign id. That is
   * deliberate: a candidate can target an ad, an ad set, a channel or the whole
   * account, and keying on the target would make a decision about a channel
   * indistinguishable from a flag on a campaign.
   */
  kind: 'campaign' | 'notification' | 'decision';
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

  /* ---- Context, for a decision the reader wrote ---------------------------

     ⭐ A written decision is written ABOUT something -- the subject the answer
     was scoped to when they typed it. That context exists at that moment and was
     being thrown away, so the card rendered as a bare line of text beside engine
     cards carrying a breadcrumb and four figures.

     "Nothing to check it against" was true of the CLAIM and false of the
     CONTEXT. The sentence cannot be verified; the numbers they were looking at
     when they wrote it can, and they belong on the card.

     ⚠️ Captured at write time, not looked up at render time. The figures are
     what the reader was seeing when they decided -- re-deriving them later would
     silently restate the decision against numbers that have since moved. */

  /** Breadcrumb, outermost first. */
  scope?: string[];
  channel?: string;
  /** The figures on screen when the decision was made. */
  evidence?: { label: string; value: string }[];
  /**
   * WHAT was decided on -- the campaign, ad set, ad, channel or all channels.
   *
   * ⭐ So a decision can always take you back to the thing it is about. Stored
   * on the flag rather than looked up from the engine, because an engine finding
   * can stop existing (the numbers move, the range changes) while the decision
   * you made about it has not. Same shape as `decisions.Target`, declared here
   * so this module does not import the engine.
   */
  target?: { kind: 'campaign' | 'adSet' | 'ad' | 'channel' | 'account'; id: string; label: string };

  /* ---- Grading (see grading.ts) --------------------------------------- */

  /** The number the decision is meant to move, captured when it was taken. */
  baseline?: Baseline;
  /** A person's grade, for decisions no number can grade. */
  outcome?: 'worked' | 'didnt';
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
  /* The LOCAL calendar date. `toISOString()` is UTC, so from 5pm in Arizona it
     already reads tomorrow -- and a decision due today turned red at dinner. A
     due date is a day on the reader's calendar, not an instant. */
  const p = (n: number) => String(n).padStart(2, '0');
  const t = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  return f.due < t;
}

/**
 * Whether a flag belongs on the Overview "Needs attention" strip.
 *
 * ⭐ ONE predicate, read by the strip that SHOWS flags and by the "Clear all"
 * that REMOVES them. Two filters for one question is the bug class this
 * codebase keeps finding -- here it would mean Clear all deleting a decision
 * the strip never showed.
 *
 * A taken decision is not attention: attending to it is what taking it meant.
 * An OVERDUE one is, again -- a commitment past its date is the most urgent
 * open loop there is.
 */
export function onAttentionStrip(f: Flag, today = new Date()): boolean {
  return f.kind !== 'decision' || isOverdue(f, today);
}

const KEY = 'growth.attention';
const CHANGED = 'growth:attention';

/**
 * A decision the PERSON wrote, as opposed to one the engine proposed.
 *
 * ⭐ The fourth source of attention, and it belongs here for the reason this file
 * has argued twice already: one record with optional fields cannot get out of
 * step with itself.
 *
 * G-001 separated attention the DATA derived from attention a PERSON assigned,
 * because "your CAC rose 42%" and "you flagged this Tuesday" are different
 * claims. G-012 added "Growth thinks you should move $8k". This is the fourth —
 * "I have decided to do this" — and it is the strongest of the four, because
 * the engine proposing something is a suggestion and a person writing it down is
 * a commitment.
 *
 * ⚠️ It must stay visibly distinct from an accepted proposal. A queue that shows
 * "the engine suggested this and you agreed" identically to "you decided this
 * yourself" has lost the only thing that separates a tool from a record.
 *
 * Keyed by a slug of the text, so writing the same decision twice is idempotent
 * — the same rule `flagId` already applies to everything else.
 */
export const OWN_PREFIX = 'own:';

export function ownDecisionId(text: string): string {
  return OWN_PREFIX + text.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function isOwnDecision(f: Flag): boolean {
  return f.kind === 'decision' && f.refId.startsWith(OWN_PREFIX);
}

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
        && (x.kind === 'campaign' || x.kind === 'notification' || x.kind === 'decision');
      /* Optional fields are validated only if present. A bad owner should not
         discard an otherwise good flag -- it should just not be assigned. */
      const okOwner = x.owner === undefined || typeof x.owner === 'string';
      const okDue = x.due === undefined || /^\d{4}-\d{2}-\d{2}$/.test(String(x.due));
      /* Context is optional and validated shallowly -- a malformed breadcrumb
         should cost the card its context, never the whole flag. */
      const okScope = x.scope === undefined
        || (Array.isArray(x.scope) && x.scope.every((v) => typeof v === 'string'));
      const okEvidence = x.evidence === undefined
        || (Array.isArray(x.evidence) && x.evidence.every((e) =>
          e && typeof e === 'object'
          && typeof (e as { label?: unknown }).label === 'string'
          && typeof (e as { value?: unknown }).value === 'string'));
      const t = x.target as { kind?: unknown; id?: unknown; label?: unknown } | undefined;
      const okTarget = t === undefined || (typeof t === 'object' && t !== null
        && ['campaign', 'adSet', 'ad', 'channel', 'account'].includes(String(t.kind))
        && typeof t.id === 'string' && typeof t.label === 'string');
      const bl = x.baseline as Partial<Baseline> | undefined;
      const okBaseline = bl === undefined || (typeof bl === 'object' && bl !== null
        && typeof bl.key === 'string' && typeof bl.value === 'number'
        && typeof bl.checkOn === 'string' && typeof bl.range === 'number');
      const okOutcome = x.outcome === undefined || x.outcome === 'worked' || x.outcome === 'didnt';
      return base && okOwner && okDue && okScope && okEvidence && okTarget && okBaseline && okOutcome;
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
/* 🐛 Also keyed on the campaign LIST. Computed once at import it filtered
   against the seed forever: on a real account the person's own campaign flags
   were hidden on every reload and the demo's stayed. A new CAMPAIGNS array
   (a source loaded) recomputes; otherwise the reference stays stable, which
   is what useSyncExternalStore needs. */
let liveFor = CAMPAIGNS;
let live: Flag[] = compute();

function compute(): Flag[] {
  liveFor = CAMPAIGNS;
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

export function addFlag(
  kind: Flag['kind'], refId: string, label: string,
  context?: Pick<Flag, 'scope' | 'channel' | 'evidence' | 'target' | 'baseline'>,
) {
  const id = flagId(kind, refId);
  if (cache.some((f) => f.id === id)) return;      // idempotent
  cache = [{ id, kind, refId, label, at: Date.now(), ...context }, ...cache];
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

/** A person's grade. null clears it -- a grade is a judgement, and reversible. */
export function setOutcome(kind: Flag['kind'], refId: string, outcome: 'worked' | 'didnt' | null) {
  const id = flagId(kind, refId);
  cache = cache.map((f) => {
    if (f.id !== id) return f;
    const next = { ...f };
    if (outcome === null) delete next.outcome; else next.outcome = outcome;
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
  if (liveFor !== CAMPAIGNS) live = compute();
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
