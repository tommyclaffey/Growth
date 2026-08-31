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
    const valid = CHANNEL_KEYS.filter((k) => parsed.includes(k));
    /* An empty set would leave a dashboard with nothing on it and no obvious
       way back, so it is treated as unset rather than honoured. */
    return valid.length ? valid : [...CHANNEL_KEYS];
  } catch {
    return [...CHANNEL_KEYS];
  }
}

/* Applied before React renders, so the first paint already reflects it — an
   effect would show the full set for one frame and then remove channels. */
setActiveChannels(read());

export function setChannels(keys: ChannelName[]) {
  const next = keys.length ? keys : [...CHANNEL_KEYS];
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
