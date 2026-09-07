import { beforeEach, describe, expect, it } from 'vitest';

class Mem {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: Mem }).localStorage = new Mem();

const { clearDraft, getDraft, setDraft } = await import('../drafts');

describe('drafts', () => {
  beforeEach(() => { clearDraft('a'); clearDraft('b'); });

  it('survives the panel closing, which is what unmounts the composer', () => {
    setDraft('a', 'half a thought');
    expect(getDraft('a')).toBe('half a thought');
  });

  it('keeps threads separate — a draft to one person must not appear in another box', () => {
    setDraft('a', 'for alice');
    setDraft('b', 'for bob');
    expect(getDraft('a')).toBe('for alice');
    expect(getDraft('b')).toBe('for bob');
  });

  it('deletes rather than storing an empty string, so keys do not accumulate', () => {
    setDraft('a', 'x');
    setDraft('a', '');
    expect(JSON.parse(localStorage.getItem('growth.drafts')!)).not.toHaveProperty('a');
  });

  it('returns empty for a conversation with nothing saved', () => {
    expect(getDraft('never-opened')).toBe('');
  });
});
