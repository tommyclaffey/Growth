import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Where connected workspaces are kept.
 *
 * A JSON file on disk, gitignored by the `*.local` rule. This is the one piece
 * that has to become a real database before anyone else can use this: a file
 * works for one machine and loses everything when the process moves. It is
 * written as a small interface so swapping it for Postgres is one file, not a
 * rewrite of the OAuth flow.
 *
 * ⚠️ These are live workspace tokens in plaintext. Fine on your own machine;
 * not fine on a server without encryption at rest.
 */

const FILE = resolve(process.cwd(), '.slack-tokens.local');

export interface Workspace {
  teamId: string;
  teamName: string;
  /** Bot token for this workspace. Never leaves the server. */
  accessToken: string;
  /** Who installed it — useful when one person's grant is revoked. */
  installedBy?: string;
  /** Channel the panel reads. Chosen after install, per workspace. */
  channelId?: string;
  channelName?: string;
  connectedAt: string;
}

type Store = { workspaces: Record<string, Workspace>; active?: string };

function read(): Store {
  if (!existsSync(FILE)) return { workspaces: {} };
  try {
    return JSON.parse(readFileSync(FILE, 'utf8')) as Store;
  } catch {
    /* A corrupt store should not take the app down — it should look like no
       workspaces are connected, which is a state the UI already handles. */
    return { workspaces: {} };
  }
}

function write(s: Store) {
  writeFileSync(FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
}

export function saveWorkspace(w: Workspace) {
  const s = read();
  /* Reinstalling replaces the token but keeps the chosen channel — otherwise
     re-authorising silently resets the panel to nothing. */
  const prev = s.workspaces[w.teamId];
  s.workspaces[w.teamId] = { ...prev, ...w };
  s.active ??= w.teamId;
  write(s);
}

export function setChannel(teamId: string, channelId: string, channelName: string) {
  const s = read();
  const w = s.workspaces[teamId];
  if (!w) return;
  w.channelId = channelId;
  w.channelName = channelName;
  write(s);
}

export function setActive(teamId: string) {
  const s = read();
  if (s.workspaces[teamId]) { s.active = teamId; write(s); }
}

export function activeWorkspace(): Workspace | null {
  const s = read();
  return (s.active && s.workspaces[s.active]) || null;
}

export function listWorkspaces(): Workspace[] {
  return Object.values(read().workspaces);
}

export function removeWorkspace(teamId: string) {
  const s = read();
  delete s.workspaces[teamId];
  if (s.active === teamId) s.active = Object.keys(s.workspaces)[0];
  write(s);
}

/** Everything the client is allowed to see — never the token. */
export function publicView() {
  const s = read();
  return {
    workspaces: Object.values(s.workspaces).map((w) => ({
      teamId: w.teamId,
      teamName: w.teamName,
      channelId: w.channelId ?? null,
      channelName: w.channelName ?? null,
      connectedAt: w.connectedAt,
    })),
    active: s.active ?? null,
  };
}
