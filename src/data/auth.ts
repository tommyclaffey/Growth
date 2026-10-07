import { useSyncExternalStore } from 'react';
import { adoptMe } from './chat';

/**
 * Who is signed in -- or that there is nobody to sign in to.
 *
 * Three honest states, never a guess:
 *
 *   checking      asked the server, no answer yet
 *   no-server     the public demo (GitHub Pages has no /api) -- no login,
 *                 the demo runs as Maya exactly as before
 *   signed-out    a server exists and nobody is signed in: the sign-in screen
 *   signed-in     a real person; they take the "me" seat
 *
 * Doubles as the app's "is there a server?" probe (backend.ts reads it), so
 * the page asks once, not twice.
 */

export type Provider = 'google' | 'slack' | 'microsoft' | 'teams';

export interface AuthUser {
  id: string;
  seat: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'owner' | 'member';
  /** The built-in demo account (Maya at Northbank). */
  demo?: boolean;
  /** The PUBLIC demo: the server answers /api/auth/* only. The app runs it
      exactly like the static demo -- sample data, no server features. */
  sandboxed?: boolean;
}

export type AuthState =
  | { status: 'checking' }
  | { status: 'no-server' }
  | { status: 'signed-out'; providers: Record<Provider, boolean>; firstRun: boolean; canCreateOwner: boolean; canUseDemo: boolean }
  | { status: 'signed-in'; user: AuthUser; providers: Record<Provider, boolean> };

let state: AuthState = { status: 'checking' };
const listeners = new Set<() => void>();
function set(next: AuthState) {
  state = next;
  if (next.status === 'signed-in') adoptMe(next.user);
  listeners.forEach((l) => l());
}

interface MeResponse {
  user: AuthUser | null;
  providers: Record<Provider, boolean>;
  firstRun: boolean;
  canCreateOwner: boolean;
  canUseDemo?: boolean;
}

let inflight: Promise<AuthState> | null = null;

/** Ask the server who this is. Cached; `force` re-asks (after signing in or out). */
export function refreshAuth(force = false): Promise<AuthState> {
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch('/api/auth/me');
      if (!r.ok) { set({ status: 'no-server' }); return state; }
      const me = await r.json() as MeResponse;
      set(me.user
        ? { status: 'signed-in', user: me.user, providers: me.providers }
        : { status: 'signed-out', providers: me.providers, firstRun: me.firstRun, canCreateOwner: me.canCreateOwner, canUseDemo: Boolean(me.canUseDemo) });
    } catch {
      set({ status: 'no-server' });
    }
    return state;
  })();
  return inflight;
}

export function authState(): AuthState { return state; }

/** Signed in to the public demo. Known before App mounts: Root waits for auth. */
export function isSandboxed(): boolean {
  return state.status === 'signed-in' && Boolean(state.user.sandboxed);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const b = await r.json().catch(() => ({})) as { error?: string };
    return { ok: r.ok, error: b.error };
  } catch {
    return { ok: false, error: 'Could not reach Growth. Is the dev server running?' };
  }
}

export async function signIn(email: string, password: string) {
  const r = await post('/api/auth/login', { email, password });
  if (r.ok) await refreshAuth(true);
  return r;
}

export async function signUp(name: string, email: string, password: string) {
  const r = await post('/api/auth/signup', { name, email, password });
  if (r.ok) await refreshAuth(true);
  return r;
}

/** Straight into the full demo as Maya. This machine only. */
export async function enterDemo() {
  const r = await post('/api/auth/demo', {});
  if (r.ok) await refreshAuth(true);
  return r;
}

export async function signOut() {
  await post('/api/auth/logout', {});
  /* A full reload, not a state flip: every module that adopted this person
     (the "me" seat, cached Slack people, the chat) starts clean. */
  window.location.assign('/Growth/');
}

/** Hands off to the provider. Signed in already = ADDING it to this account. */
export function startProvider(p: Provider) {
  window.location.assign(`/api/auth/start/${p}`);
}
