import { useEffect, useState } from 'react';
import { CHANNEL_KEYS, setActiveChannels, suppliedChannels } from './metrics';
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

/* What the person chose. Settings shows this; everything else shows effective(). */
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

/**
 * What the product shows: the person's choice, limited to the channels the
 * loaded account actually has. 🐛 Without the second half, a Meta-only account
 * listed TikTok, YouTube, Affiliates, Paid Search and Podcasts at $0 in every
 * table, report and export, with coverage notes counting them.
 */
function effective(): ChannelName[] {
  const have = suppliedChannels();
  return read().filter((k) => have.includes(k));
}

/* Applied before React renders, so the first paint already reflects it — an
   effect would show the full set for one frame and then remove channels. */
setActiveChannels(effective());

/** Re-apply after a source loads -- the account decides which channels exist. */
export function syncChannels(notify = true) {
  setActiveChannels(effective());
  /* Not during render (the useState initialiser): telling other components to
     update mid-render is a React error. They read the new list on mount. */
  if (notify) { try { window.dispatchEvent(new Event(CHANGED)); } catch { /* no window */ } }
}

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
  setActiveChannels(effective());
  window.dispatchEvent(new Event(CHANGED));
}

export function useChannels(): ChannelName[] {
  return useChannelList(effective);
}

/** The saved choice, including channels this account does not have -- for Settings' toggles. */
export function useSavedChannels(): ChannelName[] {
  return useChannelList(read);
}

function useChannelList(get: () => ChannelName[]): ChannelName[] {
  const [keys, setKeys] = useState<ChannelName[]>(get);
  useEffect(() => {
    const sync = () => setKeys(get());
    /* Another tab changed the choice: the data layer's list must follow too,
       not only this component's copy -- or the blend and the table disagree. */
    const fromOtherTab = (e: StorageEvent) => {
      if (e.key !== KEY) return;
      setActiveChannels(effective());
      sync();
    };
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', fromOtherTab);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', fromOtherTab);
    };
  }, [get]);
  return keys;
}

export function toggleChannel(key: ChannelName, on: boolean, current: ChannelName[]) {
  setChannels(on ? [...current, key] : current.filter((k) => k !== key));
}
