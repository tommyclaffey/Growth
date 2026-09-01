import { useEffect, useState } from 'react';

/**
 * Whether the dev server that hosts this app's API is reachable.
 *
 * The Slack, per-channel OAuth and assistant endpoints are Vite dev-server
 * plugins (`apply: 'serve'`), so the production build is a pure static site and
 * none of them exist there. Every control that depends on one has to know that,
 * or it lies:
 *
 *   - the Slack panel showed "Needs SLACK_CLIENT_ID … in .env.local", which is
 *     an instruction written for the developer, rendered to a visitor
 *   - the six Connect buttons linked to /api/connect/*, which is a 404 on the
 *     deployed site
 *
 * Both were correct locally and wrong in public, which is the hardest kind of
 * wrong to notice: the environment where you build is the one where it works.
 *
 * Deliberately distinct from "configured". A missing credential and a missing
 * server are different facts and want different words -- one is something to go
 * fix, the other is simply not how this build runs.
 */

let cached: boolean | null = null;

export async function probeBackend(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const res = await fetch('/api/slack/status', { method: 'GET' });
    cached = res.ok;
  } catch {
    cached = false;
  }
  return cached;
}

/** `null` while unknown — say nothing rather than guess, same as the assistant footer. */
export function useBackend(): boolean | null {
  const [present, setPresent] = useState<boolean | null>(cached);
  useEffect(() => { void probeBackend().then(setPresent); }, []);
  return present;
}
