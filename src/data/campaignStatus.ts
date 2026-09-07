import { useEffect, useState } from 'react';
import type { Stage } from '../components/StatusPill/StatusPill';
import { CAMPAIGNS } from './campaigns';

/**
 * Campaign status, stored outside React.
 *
 * It lived in `useState` inside CampaignTable, and App unmounts that component
 * on every navigation — so pausing a campaign, clicking Overview and clicking
 * back showed it Active again. StatusMenu is the most obviously live control in
 * the product, and it was the one that forgot.
 *
 * Outside React because two screens now show the same status: the table and
 * the campaign page. Held in either component, the other would be stale, and
 * "which one is right" is not a question a user should be able to ask.
 *
 * Only OVERRIDES are stored. A campaign whose status has never been changed
 * falls through to the seeded value, so the file stays small and a campaign
 * added later gets its own status rather than inheriting a stranger's.
 */

const KEY = 'growth.campaign-status';
const CHANGED = 'growth:campaign-status';

type Overrides = Record<string, Stage>;
const VALID: Stage[] = ['Active', 'Paused', 'Review', 'Ended', 'Draft'];

function read(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    /* Validated per entry rather than trusted wholesale. A hand-edited or
       half-written value should cost one campaign its override, not throw and
       lose every other one. */
    const out: Overrides = {};
    for (const [id, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && (VALID as string[]).includes(v)) out[id] = v as Stage;
    }
    return out;
  } catch { return {}; }
}

let cache: Overrides = read();

export function stageOf(id: string): Stage {
  const seeded = CAMPAIGNS.find((c) => c.id === id)?.stage ?? 'Active';
  return cache[id] ?? seeded;
}

export function setStage(id: string, next: Stage) {
  const seeded = CAMPAIGNS.find((c) => c.id === id)?.stage;
  /* Setting a campaign back to its seeded value removes the override rather
     than writing it. Otherwise the store grows every time someone toggles
     something back and forth and never shrinks. */
  if (next === seeded) delete cache[id];
  else cache[id] = next;
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* quota */ }
  window.dispatchEvent(new Event(CHANGED));
}

/** Subscribe to status changes from anywhere — table, detail page, either. */
export function useCampaignStatus(): (id: string) => Stage {
  const [, bump] = useState(0);
  useEffect(() => {
    const sync = () => bump((n) => n + 1);
    window.addEventListener(CHANGED, sync);
    /* Cross-tab too: this is a value a second tab can legitimately change. */
    window.addEventListener('storage', () => { cache = read(); sync(); });
    return () => window.removeEventListener(CHANGED, sync);
  }, []);
  return stageOf;
}
