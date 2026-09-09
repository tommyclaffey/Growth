import { beforeEach, describe, expect, it } from 'vitest';

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
  addFlag, flagId, flags, isDone, isFlagged, isOverdue, isTask, liveFlags,
  openFlags, removeFlag, restoreFlag, setTask, toggleFlag,
} = await import('../attention');
const { CAMPAIGNS } = await import('../campaigns');

beforeEach(() => { flags().slice().forEach((f) => removeFlag(f.kind, f.refId)); });

describe('assigned attention', () => {
  it('adds, finds and removes a flag', () => {
    addFlag('campaign', 'c1', 'Advantage+');
    expect(isFlagged('campaign', 'c1')).toBe(true);
    removeFlag('campaign', 'c1');
    expect(isFlagged('campaign', 'c1')).toBe(false);
  });

  it('is idempotent — flagging the same thing twice makes one entry', () => {
    addFlag('campaign', 'c1', 'Advantage+');
    addFlag('campaign', 'c1', 'Advantage+');
    expect(flags().filter((f) => f.refId === 'c1')).toHaveLength(1);
  });

  it('keeps campaign and notification ids in separate namespaces', () => {
    /* Without the kind prefix a campaign called c1 and a notification called c1
       would be the same flag, and clearing one would clear the other. */
    addFlag('campaign', 'x', 'a');
    addFlag('notification', 'x', 'b');
    expect(flags()).toHaveLength(2);
    expect(flagId('campaign', 'x')).not.toBe(flagId('notification', 'x'));
  });

  it('toggles both ways', () => {
    toggleFlag('campaign', 'c1', 'Advantage+');
    expect(isFlagged('campaign', 'c1')).toBe(true);
    toggleFlag('campaign', 'c1', 'Advantage+');
    expect(isFlagged('campaign', 'c1')).toBe(false);
  });

  it('restores a cleared flag to the TOP, not to where it was', () => {
    addFlag('campaign', 'c1', 'first');
    const cleared = flags().find((f) => f.refId === 'c1')!;
    removeFlag('campaign', 'c1');
    addFlag('campaign', 'c2', 'second');
    restoreFlag(cleared);
    /* An item put back on the queue is on it NOW. Keeping the original
       timestamp would sort it below everything raised since, where the person
       who just restored it would never see it. */
    expect(flags()[0].refId).toBe('c1');
    expect(flags()[0].at).toBeGreaterThanOrEqual(cleared.at);
  });

  it('hides flags pointing at campaigns that no longer exist', () => {
    addFlag('campaign', CAMPAIGNS[0].id, 'real');
    addFlag('campaign', 'deleted-campaign', 'gone');
    expect(liveFlags().map((f) => f.refId)).toEqual([CAMPAIGNS[0].id]);
    /* Filtered, not deleted -- a campaign missing from the seed data for one
       render must not permanently destroy the queue. */
    expect(flags()).toHaveLength(2);
  });

  it('returns a STABLE reference when nothing changed', () => {
    addFlag('campaign', 'c1', 'a');
    /* useSyncExternalStore compares snapshots by reference. A getSnapshot that
       rebuilt the array each call would re-render forever. */
    expect(liveFlags()).toBe(liveFlags());
  });

  it('survives a corrupt entry without discarding the rest', async () => {
    localStorage.setItem('growth.attention', JSON.stringify([
      { id: 'campaign:c1', kind: 'campaign', refId: 'c1', label: 'ok', at: 1 },
      { id: 'bad', kind: 'nonsense', refId: 5 },
    ]));
    const vitest = await import('vitest');
    vitest.vi.resetModules();
    const fresh = await import('../attention');
    expect(fresh.flags()).toHaveLength(1);
    expect(fresh.flags()[0].refId).toBe('c1');
  });
});

describe('tasks are flags with fields', () => {
  beforeEach(() => { flags().slice().forEach((f) => removeFlag(f.kind, f.refId)); });

  it('a flag with no owner or date is not a task', () => {
    addFlag('campaign', 'c1', 'x');
    expect(isTask(flags()[0])).toBe(false);
  });

  it('assigning to something unflagged flags it first', () => {
    /* You cannot own a thing that is not on the list, and making someone press
       two buttons to express one intention is how features get called clunky. */
    setTask('campaign', 'c1', 'Advantage+', { owner: 'jr' });
    expect(flags()).toHaveLength(1);
    expect(flags()[0].owner).toBe('jr');
    expect(isTask(flags()[0])).toBe(true);
  });

  it('null clears one field without wiping the other', () => {
    setTask('campaign', 'c1', 'x', { owner: 'jr', due: '2026-10-01' });
    setTask('campaign', 'c1', 'x', { owner: null });
    /* undefined means leave alone; null means clear. Without the distinction
       there is no way to unassign an owner without losing the due date. */
    expect(flags()[0].owner).toBeUndefined();
    expect(flags()[0].due).toBe('2026-10-01');
  });

  it('computes overdue rather than storing it', () => {
    setTask('campaign', 'c1', 'x', { due: '2026-01-01' });
    const f = flags()[0];
    expect(isOverdue(f, new Date('2026-09-09'))).toBe(true);
    /* Same record, different day, different answer. A stored flag would have
       been true forever from the moment it was written. */
    expect(isOverdue(f, new Date('2025-01-01'))).toBe(false);
  });

  it('is not overdue on the due date itself', () => {
    setTask('campaign', 'c1', 'x', { due: '2026-09-09' });
    expect(isOverdue(flags()[0], new Date('2026-09-09'))).toBe(false);
  });
});

describe('done follows the campaign, not the person', () => {
  beforeEach(() => { flags().slice().forEach((f) => removeFlag(f.kind, f.refId)); });
  const stage = (m: Record<string, string>) => (id: string) => m[id] ?? 'Active';

  it('closes when the campaign has Ended', () => {
    addFlag('campaign', 'c1', 'x');
    expect(isDone(flags()[0], stage({ c1: 'Ended' }))).toBe(true);
  });

  it('does NOT close when the campaign is merely Paused', () => {
    /* A paused campaign can come back, so its tasks stay open. This is the
       whole reason for reusing Stage instead of a parallel task status. */
    addFlag('campaign', 'c1', 'x');
    expect(isDone(flags()[0], stage({ c1: 'Paused' }))).toBe(false);
  });

  it('never closes a notification flag, which has no campaign to end', () => {
    addFlag('notification', 'n1', 'x');
    expect(isDone(flags()[0], stage({ n1: 'Ended' }))).toBe(false);
  });

  it('openFlags drops the ended ones and keeps the rest', () => {
    addFlag('campaign', 'c1', 'ended one');
    addFlag('campaign', 'c2', 'live one');
    const open = openFlags(flags(), stage({ c1: 'Ended' }));
    expect(open.map((f) => f.refId)).toEqual(['c2']);
  });
});
