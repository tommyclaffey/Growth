import { useSyncExternalStore } from 'react';
import type { ChannelName } from '../styles/tokens';
import type { Stage } from '../components/StatusPill/StatusPill';
import { CHANNEL_KEYS, CHANNEL_LABEL, type Range } from './metrics';

/**
 * Scheduled reports.
 *
 * ⚠️ `channels` is the QUERY, not a label. The row's scope text is derived from
 * it, so the two cannot disagree. They did: "Creator channel blended" read
 * "TikTok · YouTube" while its Export ran TikTok alone, because the label and the
 * query were two hand-typed fields. Empty means all channels you run.
 *
 * ⚠️ The window follows the CADENCE. A weekly report covers a week; every row
 * used to export 30 days whatever it said it was.
 */
export type Cadence = 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly';

export interface Report {
  id: string;
  name: string;
  /** Empty = all channels you run. */
  channels: ChannelName[];
  cadence: Cadence;
  /** Human schedule, e.g. "Every Monday, 8:00". */
  when: string;
  /** Member ids from the roster. Seed reports carry a count instead. */
  recipients: string[] | number;
  /** "Aug 10". Undefined = never run. Always on or before the last day of data. */
  lastRun?: string;
  stage: Stage;
  /** Made in this browser, so it can be removed. The seeded five cannot. */
  own?: boolean;
}

/**
 * How much data a cadence covers.
 *
 * Daily has no 1-day window to run -- the smallest range is 7 -- so a daily
 * report is a TRAILING week, sent every morning. Said on the row, not hidden.
 */
export const WINDOW: Record<Cadence, Range> = { Daily: 7, Weekly: 7, Monthly: 30, Quarterly: 90 };

export const DEFAULT_WHEN: Record<Cadence, string> = {
  Daily: 'Daily, 7:00', Weekly: 'Every Monday, 8:00', Monthly: 'Monthly, 1st', Quarterly: 'Quarterly',
};

/* Last-run dates sit ON OR BEFORE Aug 12, the last day the data covers. They
   read Aug 22-26, which is a report claiming to have run on data that does not
   exist yet. Aug 12 2026 is a Wednesday: the Monday before is the 10th, the
   Friday the 7th. */
const SEED: Report[] = [
  { id: 'r1', name: 'Weekly performance summary', channels: [], cadence: 'Weekly',
    when: 'Every Monday, 8:00', recipients: 6, lastRun: 'Aug 10', stage: 'Active' },
  { id: 'r2', name: 'Meta deep dive', channels: ['meta'], cadence: 'Weekly',
    when: 'Every Friday, 16:00', recipients: 3, lastRun: 'Aug 7', stage: 'Active' },
  { id: 'r3', name: 'Creator channel blended', channels: ['tiktok', 'youtube'], cadence: 'Monthly',
    when: 'Monthly, 1st', recipients: 4, lastRun: 'Aug 1', stage: 'Active' },
  { id: 'r4', name: 'CAC watch', channels: [], cadence: 'Daily',
    when: 'Daily, 7:00', recipients: 2, lastRun: 'Aug 3', stage: 'Paused' },
  { id: 'r5', name: 'Q3 board pack', channels: [], cadence: 'Quarterly',
    when: 'Quarterly', recipients: 9, stage: 'Draft' },
];

/** "Meta", "TikTok · YouTube", or "All channels". */
export function scopeLabel(r: Pick<Report, 'channels'>): string {
  return r.channels.length === 0 ? 'All channels' : r.channels.map((c) => CHANNEL_LABEL[c]).join(' · ');
}

/**
 * What Export actually runs, given the channels switched on.
 *
 * A switched-off channel is gone everywhere in this product, and a report is not
 * an exception: exporting Meta from an account that does not run Meta would be
 * a file of numbers for a business that does not exist. `null` = nothing left.
 */
export function exportChannels(r: Pick<Report, 'channels'>, active: ChannelName[]): ChannelName[] | null {
  const wanted = r.channels.length === 0 ? active : r.channels.filter((c) => active.includes(c));
  return wanted.length > 0 ? wanted : null;
}

const KEY = 'growth.reports';
const CHANGED = 'growth:reports';
const CADENCES: Cadence[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];

/* Only the reports YOU made are stored. The seed stays in code, so a later
   build can correct it (as this one did) without fighting old storage. */
function read(): Report[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!Array.isArray(raw)) return [];
    return raw.filter((r: unknown): r is Report => {
      if (!r || typeof r !== 'object') return false;
      const x = r as Partial<Report>;
      return typeof x.id === 'string' && typeof x.name === 'string'
        && Array.isArray(x.channels) && x.channels.every((c) => CHANNEL_KEYS.includes(c))
        && CADENCES.includes(x.cadence as Cadence) && typeof x.when === 'string'
        && Array.isArray(x.recipients) && x.recipients.every((m) => typeof m === 'string');
    }).map((r) => ({ ...r, own: true, stage: 'Active' as const, lastRun: undefined }));
  } catch {
    return [];
  }
}

let mine: Report[] = read();
let all: Report[] = [...mine, ...SEED];

function save() {
  all = [...mine, ...SEED];
  try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch { /* quota */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function reports(): Report[] {
  return all;
}

export function addReport(r: Pick<Report, 'name' | 'channels' | 'cadence' | 'recipients'>): Report {
  const made: Report = {
    ...r,
    id: `own-${Date.now().toString(36)}`,
    when: DEFAULT_WHEN[r.cadence],
    stage: 'Active',
    own: true,
  };
  mine = [made, ...mine];
  save();
  return made;
}

export function removeReport(id: string) {
  if (!mine.some((r) => r.id === id)) return;       // the seed cannot be removed
  mine = mine.filter((r) => r.id !== id);
  save();
}

function subscribe(fn: () => void) {
  const sync = (e: StorageEvent) => { if (e.key === KEY) { mine = read(); all = [...mine, ...SEED]; fn(); } };
  window.addEventListener(CHANGED, fn);
  window.addEventListener('storage', sync);
  return () => {
    window.removeEventListener(CHANGED, fn);
    window.removeEventListener('storage', sync);
  };
}

export function useReports(): Report[] {
  return useSyncExternalStore(subscribe, reports, () => SEED);
}
