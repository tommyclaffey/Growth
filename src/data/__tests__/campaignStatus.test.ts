import { describe, it, expect, beforeEach } from 'vitest';
import { CAMPAIGNS } from '../campaigns';

/* A tiny localStorage so the store can be exercised in node. */
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

const { setStage, stageOf } = await import('../campaignStatus');

describe('campaign status', () => {
  beforeEach(() => localStorage.clear());

  it('falls through to the seeded stage when never changed', () => {
    for (const c of CAMPAIGNS) expect(stageOf(c.id)).toBe(c.stage);
  });

  it('remembers a change', () => {
    const c = CAMPAIGNS[0];
    setStage(c.id, 'Paused');
    expect(stageOf(c.id)).toBe('Paused');
  });

  it('stores only overrides — setting back to seeded removes the entry', () => {
    /* Otherwise the store grows every time someone toggles back and forth and
       never shrinks. */
    const c = CAMPAIGNS[0];
    setStage(c.id, 'Paused');
    expect(JSON.parse(localStorage.getItem('growth.campaign-status')!)).toHaveProperty(c.id);
    setStage(c.id, c.stage);
    expect(JSON.parse(localStorage.getItem('growth.campaign-status')!)).not.toHaveProperty(c.id);
  });

  it('changing one campaign does not touch another', () => {
    const [a, b] = CAMPAIGNS;
    setStage(a.id, 'Ended');
    expect(stageOf(b.id)).toBe(b.stage);
  });
});
