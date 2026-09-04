import { useEffect, useState } from 'react';
import { CHANNEL_KEYS, setActiveChannels } from './metrics';
import type { ChannelName } from '../styles/tokens';

/**
 * Which channels this account runs.
 *
 * Switching one off removes it everywhere — the blend, the tables, the charts,
 * the picker, the export, its own page. Not greyed out: gone. A company that
 * does no affiliate marketing should not have to look at the word, and a
 * blended CAC that includes a channel they do not run is simply wrong.
 */

const KEY = 'growth.channels';
const CHANGED = 'growth:channels-changed';

function read(): ChannelName[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [...CHANNEL_KEYS];
    const parsed = JSON.parse(raw) as string[];
    /* An explicitly saved empty array is honoured. Absent (`!raw` above) means
       never chosen and defaults to everything; `[]` means chosen, and
       overriding a deliberate choice on reload is how a setting stops being
       believed. The screens have an empty state for exactly this. */
    return CHANNEL_KEYS.filter((k) => parsed.includes(k));
  } catch {
    return [...CHANNEL_KEYS];
  }
}

/* Applied before React renders, so the first paint already reflects it — an
   effect would show the full set for one frame and then remove channels. */
setActiveChannels(read());

export function setChannels(keys: ChannelName[]) {
  /* Turning the last channel off used to turn all six back ON.

     The guard was meant to stop an empty dashboard, and the cure was stranger
     than the disease: you switch one thing off and six things switch on, which
     is not what a toggle appears to promise. It also made the empty state
     unreachable, so a designed state had no path to it.

     Empty is now allowed. It is a real thing a user can do, the screens have
     an empty state built for exactly this, and a product that silently
     overrides a deliberate choice is worse than one that shows nothing. */
  const next = keys;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota */ }
  setActiveChannels(next);
  window.dispatchEvent(new Event(CHANGED));
}

export function useChannels(): ChannelName[] {
  const [keys, setKeys] = useState<ChannelName[]>(() => read());
  useEffect(() => {
    const sync = () => setKeys(read());
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return keys;
}

export function toggleChannel(key: ChannelName, on: boolean, current: ChannelName[]) {
  setChannels(on ? [...current, key] : current.filter((k) => k !== key));
}
