import { useSyncExternalStore } from 'react';
import type { ChannelName } from '../styles/tokens';
import type { Stage } from '../components/StatusPill/StatusPill';
import { CHANNEL_KEYS, CHANNEL_LABEL, PERIOD_END, windowLabels, SEEDED_PERIOD_END, delta, formatMetric, totals, type Range } from './metrics';
import type { ReportRef } from './chat';

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
  /** Weekly only: 0 = Sunday … 6 = Saturday. Drives Next run. */
  weekday?: number;
  /** Team members, by roster id -- shown as faces. */
  recipients: string[];
  /** People outside the workspace (a client, the board). Counted, not named. */
  external?: number;
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
/* Recipients were bare counts -- 6, 9 -- in a workspace of four people. Now the
   team are named (and shown as faces) and anyone else is counted as external,
   so the numbers add up to people who exist. */
const SEED: Report[] = [
  { id: 'r1', name: 'Weekly performance summary', channels: [], cadence: 'Weekly', weekday: 1,
    when: 'Every Monday, 8:00', recipients: ['maya', 'jr', 'dk', 'ap'], external: 2,
    lastRun: 'Aug 10', stage: 'Active' },
  { id: 'r2', name: 'Meta deep dive', channels: ['meta'], cadence: 'Weekly', weekday: 5,
    when: 'Every Friday, 16:00', recipients: ['maya', 'jr'], external: 1,
    lastRun: 'Aug 7', stage: 'Active' },
  { id: 'r3', name: 'Creator channel blended', channels: ['tiktok', 'youtube'], cadence: 'Monthly',
    when: 'Monthly, 1st', recipients: ['jr', 'ap'], external: 2, lastRun: 'Aug 1', stage: 'Active' },
  { id: 'r4', name: 'CAC watch', channels: [], cadence: 'Daily',
    when: 'Daily, 7:00', recipients: ['maya', 'dk'], lastRun: 'Aug 3', stage: 'Paused' },
  { id: 'r5', name: 'Q3 board pack', channels: [], cadence: 'Quarterly',
    when: 'Quarterly', recipients: ['maya'], external: 8, stage: 'Draft' },
];

/**
 * When a report next goes out, or undefined if it will not.
 *
 * ⚠️ Measured from the LAST DAY OF DATA (Aug 12), not the real clock. The whole
 * product is frozen on that day -- every chart ends there -- and a Next run of
 * "Oct 5" beside a Last run of "Aug 10" would be a report that silently skipped
 * eight weeks. Once real APIs land, `now` becomes today.
 */
export function nextRun(r: Report, now: Date = PERIOD_END): Date | undefined {
  if (r.stage !== 'Active') return undefined;
  const d = new Date(now);
  if (r.cadence === 'Daily') { d.setUTCDate(d.getUTCDate() + 1); return d; }
  if (r.cadence === 'Weekly') {
    const want = r.weekday ?? 1;
    const ahead = ((want - d.getUTCDay() + 7) % 7) || 7;   // strictly after today
    d.setUTCDate(d.getUTCDate() + ahead);
    return d;
  }
  if (r.cadence === 'Monthly') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const q = Math.floor(d.getUTCMonth() / 3) + 1;          // next quarter's first month
  return new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1));
}

/** "Mon Aug 17". */
export function formatRun(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

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
    }).map((r) => ({ ...r, own: true, stage: 'Active' as const, lastRun: undefined, weekday: r.cadence === 'Weekly' ? 1 : undefined }));
  } catch {
    return [];
  }
}

/* Paused / resumed, by report id -- the seed's own stage is the default. Stored
   apart from the seed so the seed stays correctable in code. */
const STAGE_KEY = 'growth.report-stages';
function readStages(): Record<string, Stage> {
  try {
    const raw = JSON.parse(localStorage.getItem(STAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => v === 'Active' || v === 'Paused')) as Record<string, Stage>;
  } catch {
    return {};
  }
}

let mine: Report[] = read();
let stages: Record<string, Stage> = readStages();
/* 🐛 The seed's "Last sent Aug 10" is a fact about the DEMO account. On a real
   account ending Sept 28 it sat beside "Next Mon Oct 5" -- a report that
   appeared to have skipped seven weeks. Off the demo, nothing has been sent. */
const period = () => PERIOD_END.toISOString().slice(0, 10);

let composedFor = '';
let all: Report[] = compose();

function compose(): Report[] {
  composedFor = period();
  const demo = composedFor === SEEDED_PERIOD_END;
  return [...mine, ...SEED].map((r) => {
    const x = demo ? r : { ...r, lastRun: undefined };
    return stages[r.id] ? { ...x, stage: stages[r.id] } : x;
  });
}

function save() {
  all = compose();
  try {
    localStorage.setItem(KEY, JSON.stringify(mine));
    localStorage.setItem(STAGE_KEY, JSON.stringify(stages));
  } catch { /* quota */ }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Pause, resume, or schedule a draft. Active <-> Paused only: a draft becomes
 * Active once and does not go back to being a draft.
 */
export function setReportStage(id: string, stage: 'Active' | 'Paused') {
  if (!all.some((r) => r.id === id)) return;
  stages = { ...stages, [id]: stage };
  save();
}

export function reports(): Report[] {
  if (composedFor !== period()) all = compose();
  return all;
}

export function addReport(r: Pick<Report, 'name' | 'channels' | 'cadence' | 'recipients'>): Report {
  const made: Report = {
    ...r,
    id: `own-${Date.now().toString(36)}`,
    when: DEFAULT_WHEN[r.cadence],
    weekday: r.cadence === 'Weekly' ? 1 : undefined,
    stage: 'Active',
    own: true,
  };
  mine = [made, ...mine];
  save();
  return made;
}

/** Back to the seed's own stages. For tests: the module cache outlives localStorage.clear(). */
export function resetReportStages() {
  stages = {};
  save();
}

export function removeReport(id: string) {
  if (!mine.some((r) => r.id === id)) return;       // the seed cannot be removed
  mine = mine.filter((r) => r.id !== id);
  const { [id]: _gone, ...rest } = stages;
  void _gone;
  stages = rest;
  save();
}

function subscribe(fn: () => void) {
  const sync = (e: StorageEvent) => {
    if (e.key === KEY || e.key === STAGE_KEY) { mine = read(); stages = readStages(); all = compose(); fn(); }
  };
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

/**
 * What a report says right now, frozen for sending -- the same figures the
 * Preview panel shows, formatted once.
 */
export function snapshot(r: Report, channels: ChannelName[]): ReportRef {
  const range = WINDOW[r.cadence];
  const a = windowLabels(range); const b = windowLabels(range, 1);
  const span = (l: string[]) => (l.length ? `${l[0]} – ${l[l.length - 1]}` : 'no earlier data');
  const win = `${span(a)}, compared with ${span(b)}`;
  const rows = channels.map((c) => {
    const t = totals(c, range);
    const d = delta(c, 'CAC', range);
    return {
      channel: CHANNEL_LABEL[c],
      spend: formatMetric('Spend', t.spend),
      leads: Math.round(t.leads).toLocaleString(),
      /* No leads: no CAC, and no change in it -- a dash, never "$0.00" or "−100%". */
      cac: t.leads > 0 ? formatMetric('CAC', t.cac) : '—',
      change: t.leads > 0 ? `${d > 0 ? '+' : ''}${d}% CAC` : '—',
    };
  });
  const sum = channels.reduce((a, c) => {
    const t = totals(c, range);
    return { spend: a.spend + t.spend, leads: a.leads + t.leads };
  }, { spend: 0, leads: 0 });
  return {
    id: r.id, name: r.name, window: win, rows,
    total: channels.length > 1 ? {
      spend: formatMetric('Spend', sum.spend),
      leads: Math.round(sum.leads).toLocaleString(),
      cac: formatMetric('CAC', sum.leads > 0 ? sum.spend / sum.leads : 0),
    } : undefined,
  };
}
