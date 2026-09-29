import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Who can sign in, and who is signed in.
 *
 * Two local files, gitignored by *.local, private (0600), written atomically --
 * the same compromise as every token store here: right for one machine, a
 * database before this is hosted. Swapping it is this one file.
 *
 * ⚠️ SEATS. The product's chat, decisions and Slack links are keyed by a
 * person id ("maya", "jr"...). The FIRST account -- the owner -- takes the
 * "maya" seat, so everything already in this instance (the Slack link, the
 * decisions queue, the threads) stays theirs. Everyone after gets their own id
 * as their seat. A seat is assigned by the server, never claimed by a browser.
 */

export type Provider = 'google' | 'slack' | 'microsoft' | 'teams';

export interface User {
  id: string;
  /** The person id the rest of the product keys on. See SEATS above. */
  seat: string;
  email: string;
  name: string;
  avatar?: string;
  role: 'owner' | 'member';
  /** scrypt$<salt hex>$<hash hex>. Absent for people who only use a provider. */
  password?: string;
  identities: Partial<Record<Provider, string>>;
  createdAt: string;
}

const OWNER_SEAT = 'maya';
/* GROWTH_DATA_DIR lets tests use a throwaway folder; normally the project root. */
const dir = () => process.env.GROWTH_DATA_DIR ?? process.cwd();
const USERS = () => resolve(dir(), '.growth-users.local');
const SESSIONS = () => resolve(dir(), '.growth-sessions.local');
const SESSION_DAYS = 30;

function readJson<T>(file: string, empty: T): T {
  try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as T : empty; } catch { return empty; }
}
function writeJson(file: string, v: unknown) {
  writeFileSync(`${file}.tmp`, JSON.stringify(v, null, 2), { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

/* ------------------------------------------------------------------ users */

export function users(): User[] {
  return readJson<{ users: User[] }>(USERS(), { users: [] }).users;
}
function saveUsers(list: User[]) { writeJson(USERS(), { users: list }); }

export const normEmail = (e: string) => e.trim().toLowerCase();

export function userByEmail(email: string): User | undefined {
  const e = normEmail(email);
  return users().find((u) => u.email === e);
}
export function userById(id: string): User | undefined {
  return users().find((u) => u.id === id);
}
export function userByIdentity(p: Provider, subject: string): User | undefined {
  return users().find((u) => u.identities[p] === subject);
}

/**
 * May this email create an account?
 *
 * - No accounts yet: only from THIS machine (the owner). Otherwise a stranger
 *   reaching the tunnel first would own the instance.
 * - After that: only emails on GROWTH_ALLOWED_EMAILS -- exact addresses, or
 *   "@company.com" for a whole domain. Unset = nobody new.
 */
export function mayJoin(email: string, local: boolean, allowed = process.env.GROWTH_ALLOWED_EMAILS ?? ''): boolean {
  if (users().length === 0) return local;
  const e = normEmail(email);
  return allowed.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
    .some((rule) => (rule.startsWith('@') ? e.endsWith(rule) : e === rule));
}

export function createUser(u: { email: string; name: string; avatar?: string; password?: string; identity?: [Provider, string] }): User {
  const list = users();
  const owner = list.length === 0;
  const id = owner ? OWNER_SEAT : `u_${randomBytes(6).toString('hex')}`;
  const made: User = {
    id, seat: id, email: normEmail(u.email), name: u.name.trim() || normEmail(u.email).split('@')[0],
    avatar: u.avatar, role: owner ? 'owner' : 'member',
    password: u.password ? hashPassword(u.password) : undefined,
    identities: u.identity ? { [u.identity[0]]: u.identity[1] } : {},
    createdAt: new Date().toISOString(),
  };
  saveUsers([...list, made]);
  return made;
}

export function updateUser(id: string, patch: (u: User) => User): User | undefined {
  const list = users();
  const i = list.findIndex((u) => u.id === id);
  if (i < 0) return undefined;
  list[i] = patch(list[i]);
  saveUsers(list);
  return list[i];
}

/* --------------------------------------------------------------- password */

export const MIN_PASSWORD = 10;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function checkPassword(pw: string, stored: string | undefined): boolean {
  /* Always spend the scrypt time, even for an unknown account, so the response
     time does not reveal which emails exist. */
  const [, saltHex, hashHex] = (stored ?? `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`).split('$');
  const got = scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const want = Buffer.from(hashHex, 'hex');
  return Boolean(stored) && got.length === want.length && timingSafeEqual(got, want);
}

/* --------------------------------------------------------------- sessions */

type Sessions = Record<string, { userId: string; exp: number }>;
/* Only a HASH of the token is stored -- a copy of this file is not a copy of
   everyone's sign-in. */
const tokenKey = (t: string) => createHash('sha256').update(t).digest('hex');

export function createSession(userId: string): { token: string; maxAge: number } {
  const token = randomBytes(32).toString('base64url');
  const all = readJson<Sessions>(SESSIONS(), {});
  const now = Date.now();
  for (const [k, v] of Object.entries(all)) if (v.exp < now) delete all[k];
  const maxAge = SESSION_DAYS * 86_400;
  all[tokenKey(token)] = { userId, exp: now + maxAge * 1000 };
  writeJson(SESSIONS(), all);
  return { token, maxAge };
}

export function sessionUser(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const s = readJson<Sessions>(SESSIONS(), {})[tokenKey(token)];
  if (!s || s.exp < Date.now()) return undefined;
  return userById(s.userId);
}

export function endSession(token: string | undefined) {
  if (!token) return;
  const all = readJson<Sessions>(SESSIONS(), {});
  delete all[tokenKey(token)];
  writeJson(SESSIONS(), all);
}

/* ------------------------------------------------------------ rate limits */

/* Ten wrong passwords per address per 15 minutes. In memory: a restart
   resets it, which is acceptable for a dev server and noted for hosting. */
const attempts = new Map<string, { n: number; until: number }>();
export function tooMany(key: string): boolean {
  const a = attempts.get(key);
  return Boolean(a && a.until > Date.now() && a.n >= 10);
}
export function failed(key: string) {
  const a = attempts.get(key);
  const fresh = !a || a.until < Date.now();
  attempts.set(key, { n: fresh ? 1 : a!.n + 1, until: fresh ? Date.now() + 15 * 60_000 : a!.until });
}
export function succeeded(key: string) { attempts.delete(key); }
