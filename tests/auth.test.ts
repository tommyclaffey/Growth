import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  checkPassword, createSession, createUser, demoUser, endSession, failed, hashPassword, mayJoin, sessionUser, tooMany, users,
} from '../server/authStore.js';
import { decodeIdToken, identityOf } from '../server/auth.js';
import { tokenFor, type Workspace } from '../server/slackStore.js';

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'growth-auth-')); process.env.GROWTH_DATA_DIR = dir; });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.GROWTH_DATA_DIR; });

describe('who may create an account', () => {
  it('🛑 the FIRST account only from this machine -- a stranger on the tunnel cannot claim the instance', () => {
    expect(mayJoin('stranger@evil.example', false)).toBe(false);
    expect(mayJoin('tommy@example.com', true)).toBe(true);
  });

  it('the first account is the owner and takes the "maya" seat, so existing data stays theirs', () => {
    const u = createUser({ email: 'Tommy@Example.com', name: 'Tommy', password: 'long enough pw' });
    expect(u).toMatchObject({ role: 'owner', seat: 'maya', email: 'tommy@example.com' });
    expect(createUser({ email: 'jess@example.com', name: 'Jess' })).toMatchObject({ role: 'member' });
    expect(users()[1].seat).not.toBe('maya');
  });

  it('🛑 after that: only the allow-list -- exact emails or @domain', () => {
    createUser({ email: 'tommy@example.com', name: 'Tommy' });
    expect(mayJoin('dan@acme.com', true, '')).toBe(false);                   // unset = nobody new, even locally
    expect(mayJoin('dan@acme.com', false, 'jess@x.com, @acme.com')).toBe(true);
    expect(mayJoin('dan@notacme.com', false, '@acme.com')).toBe(false);
    expect(mayJoin('JESS@x.com', false, 'jess@x.com')).toBe(true);
  });
});

describe('the demo account', () => {
  it('is Maya in the maya seat, with no password, created once', () => {
    /* mayOwn: only the local route on a fresh install, never the public one. */
    const d = demoUser({ mayOwn: true });
    expect(d).toMatchObject({ seat: 'maya', name: 'Maya Okonkwo', demo: true, role: 'owner' });
    expect(d.password).toBeUndefined();
    expect(demoUser().id).toBe(d.id);
    expect(users()).toHaveLength(1);
  });
});

describe('passwords', () => {
  it('hashed with scrypt, never stored plain; right password passes, wrong fails', () => {
    const h = hashPassword('correct horse battery');
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(h).not.toContain('correct');
    expect(checkPassword('correct horse battery', h)).toBe(true);
    expect(checkPassword('wrong horse battery', h)).toBe(false);
    expect(checkPassword('anything', undefined)).toBe(false);
  });

  it('ten wrong attempts locks that address for 15 minutes', () => {
    for (let i = 0; i < 10; i++) failed('1.2.3.4|a@b.c');
    expect(tooMany('1.2.3.4|a@b.c')).toBe(true);
    expect(tooMany('1.2.3.4|other@b.c')).toBe(false);
  });
});

describe('sessions', () => {
  it('a session finds its user; signing out ends it; the file holds only hashes, privately', () => {
    const u = createUser({ email: 't@example.com', name: 'T' });
    const { token } = createSession(u.id);
    expect(sessionUser(token)?.id).toBe(u.id);
    expect(sessionUser('forged')).toBeUndefined();
    expect(sessionUser(undefined)).toBeUndefined();
    const raw = readFileSync(join(dir, '.growth-sessions.local'), 'utf8');
    expect(raw).not.toContain(token);
    expect(statSync(join(dir, '.growth-sessions.local')).mode & 0o077).toBe(0);
    endSession(token);
    expect(sessionUser(token)).toBeUndefined();
  });
});

describe('provider identities', () => {
  const jwt = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;

  it('Google and Slack vouch for the email; Microsoft never does -- so it can never take over an account by email', () => {
    const g = identityOf('google', decodeIdToken(jwt({ iss: 'https://accounts.google.com', aud: 'x', sub: '123', email: 'a@b.com', email_verified: true })));
    expect(g).toMatchObject({ subject: '123', verified: true });
    const m = identityOf('microsoft', decodeIdToken(jwt({ iss: 'x', aud: 'x', sub: 's', oid: 'o1', tid: 't1', email: 'tommy@example.com' })));
    expect(m).toMatchObject({ subject: 't1:o1', verified: false });
  });
});

describe('Slack acts as the signed-in person', () => {
  const ws = (extra: Partial<Workspace> = {}): Workspace => ({
    teamId: 'T1', teamName: 'Team', accessToken: 'xoxp-installer', installedBy: 'U_TOMMY',
    links: { maya: 'U_TOMMY' }, connectedAt: '', ...extra,
  });
  it('🛑 the installer’s token is used ONLY for the installer’s own seat', () => {
    expect(tokenFor(ws(), 'maya')).toBe('xoxp-installer');
    expect(tokenFor(ws(), 'u_jess')).toBeUndefined();
    expect(tokenFor(ws({ links: { maya: 'U_TOMMY', u_jess: 'U_TOMMY' } }), 'u_jess')).toBe('xoxp-installer');   // same Slack person
  });
  it('each person’s own token wins', () => {
    expect(tokenFor(ws({ tokens: { u_jess: 'xoxp-jess' } }), 'u_jess')).toBe('xoxp-jess');
  });
});

describe('🚂 hosted (Railway): the owner is named in advance', () => {
  it('no request is local there -- only GROWTH_OWNER_EMAIL may create the first account', () => {
    process.env.GROWTH_OWNER_EMAIL = 'Tommy@Example.com';
    try {
      expect(mayJoin('stranger@evil.example', false)).toBe(false);
      expect(mayJoin('tommy@example.com', false)).toBe(true);
      createUser({ email: 'tommy@example.com', name: 'Tommy' });
      /* Once the owner exists, the name no longer opens anything. */
      expect(mayJoin('tommy@example.com', false, '')).toBe(false);
    } finally { delete process.env.GROWTH_OWNER_EMAIL; }
  });

  it('unset on a host means nobody can claim the instance -- the safe failure', () => {
    expect(mayJoin('anyone@example.com', false)).toBe(false);
  });
});
