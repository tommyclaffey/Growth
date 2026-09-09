import { beforeEach, describe, expect, it } from 'vitest';

/* Same node shim the campaign-status store uses. */
class Mem {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: Mem }).localStorage = new Mem();
(globalThis as unknown as { window: { addEventListener(): void; dispatchEvent(): void } }).window = {
  addEventListener() {}, dispatchEvent() {},
};

const {
  DEFAULT_PREFS, dismissAlert, dismissAll, isRead, markAllRead, markRead, markUnread,
  prefs, restoreAlerts, setPref, undismissAlert,
} = await import('../prefs');

/* The module caches on import, so each test writes through the real setter
   rather than poking localStorage and hoping the cache noticed. */
beforeEach(() => {
  setPref('cacAlerts', DEFAULT_PREFS.cacAlerts);
  setPref('pacing', DEFAULT_PREFS.pacing);
  setPref('readAlerts', []);
});

describe('prefs', () => {
  it('persists a switch to localStorage rather than losing it on navigation', () => {
    setPref('cacAlerts', false);
    expect(prefs().cacAlerts).toBe(false);
    expect(JSON.parse(localStorage.getItem('growth.prefs')!).cacAlerts).toBe(false);
  });

  it('marks read by id, so the set survives the alert list changing', () => {
    markAllRead(['n1', 'n2']);
    expect(isRead('n1')).toBe(true);
    expect(isRead('n3')).toBe(false);
  });

  it('does not double-count an id already read', () => {
    markAllRead(['n1']);
    markAllRead(['n1', 'n2']);
    expect(prefs().readAlerts).toEqual(['n1', 'n2']);
  });

  it('validates field by field, so one bad value does not discard the rest', async () => {
    localStorage.setItem('growth.prefs', JSON.stringify({
      cacAlerts: 'yes',        // wrong type -> falls back to its default
      pacing: true,            // valid -> must survive
      digestTo: 42,            // wrong type -> falls back
      readAlerts: ['a', 7],    // one bad entry -> dropped, 'a' kept
    }));
    /* vitest caches modules, so a plain re-import returns the same instance.
       resetModules forces the file to run its validator again against what is
       now in storage -- which is the thing under test. */
    const vitest = await import('vitest');
    vitest.vi.resetModules();
    const fresh = await import('../prefs');
    const p = fresh.prefs();
    expect(p.pacing).toBe(true);
    expect(p.cacAlerts).toBe(DEFAULT_PREFS.cacAlerts);
    expect(p.digestTo).toBe(DEFAULT_PREFS.digestTo);
    expect(p.readAlerts).toEqual(['a']);
  });
});

describe('dismissing an addressed alert', () => {
  beforeEach(() => { setPref('dismissedAlerts', []); setPref('readAlerts', []); });

  it('persists, so the strip does not come back on reload', () => {
    dismissAlert('meta');
    expect(prefs().dismissedAlerts).toContain('meta');
    expect(JSON.parse(localStorage.getItem('growth.prefs')!).dismissedAlerts).toEqual(['meta']);
  });

  it('does not double-add an alert already dismissed', () => {
    dismissAlert('meta');
    dismissAlert('meta');
    expect(prefs().dismissedAlerts).toEqual(['meta']);
  });

  it('keeps dismissed separate from read — opening Notifications must not clear the strip', () => {
    markAllRead(['n1']);
    expect(prefs().readAlerts).toContain('n1');
    expect(prefs().dismissedAlerts).toEqual([]);
  });

  it('restores everything, so clearing the strip is not a one-way door', () => {
    dismissAll(['meta', 'tiktok']);
    expect(prefs().dismissedAlerts).toHaveLength(2);
    restoreAlerts();
    expect(prefs().dismissedAlerts).toEqual([]);
  });
});

describe('every action has a reverse', () => {
  beforeEach(() => { setPref('readAlerts', []); setPref('dismissedAlerts', []); });

  it('mark read, then mark unread', () => {
    markRead('n1');
    expect(isRead('n1')).toBe(true);
    markUnread('n1');
    expect(isRead('n1')).toBe(false);
  });

  it('dismiss one alert, then undo that one alert', () => {
    dismissAll(['meta', 'tiktok']);
    undismissAlert('meta');
    /* Per-item, not the bulk restore. Undoing one mistake should not
       resurrect everything else you deliberately cleared. */
    expect(prefs().dismissedAlerts).toEqual(['tiktok']);
  });

  it('is a no-op when there is nothing to reverse', () => {
    markUnread('never-read');
    undismissAlert('never-dismissed');
    expect(prefs().readAlerts).toEqual([]);
    expect(prefs().dismissedAlerts).toEqual([]);
  });
});
