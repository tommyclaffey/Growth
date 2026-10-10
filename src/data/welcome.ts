import { useSyncExternalStore } from 'react';

/**
 * The demo's welcome card: open or not, and whether this browser has seen it.
 *
 * A tiny store rather than App state because two places open it -- App on a
 * first visit, and the DEMO pill whenever someone wants it back.
 */
export const WELCOME_KEY = 'growth.welcome.v1';

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openWelcome() {
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* private mode */ }
  open = true;
  emit();
}
export function closeWelcome() { open = false; emit(); }
export function welcomeSeen(): boolean {
  try { return Boolean(localStorage.getItem(WELCOME_KEY)); } catch { return true; }
}
export function useWelcomeOpen(): boolean {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => open,
    () => open,
  );
}
