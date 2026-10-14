import { describe, expect, it } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import { CHANNEL_KEYS, totals } from '../metrics';

describe('⭐ the account runs several campaigns at once (Oct 12)', () => {
  it('each channel total is the sum of its campaigns', () => {
    for (const k of CHANNEL_KEYS) {
      const sum = CAMPAIGNS.filter((c) => c.channel === k).reduce((a, c) => a + c.spend, 0);
      expect(Math.round(totals(k, 30).spend), k).toBe(sum);
    }
  });
  it('every channel has at least two live campaigns, each with full ad sets', () => {
    for (const k of CHANNEL_KEYS) {
      const live = CAMPAIGNS.filter((c) => c.channel === k && c.stage === 'Active');
      expect(live.length, k).toBeGreaterThanOrEqual(2);
    }
    for (const c of CAMPAIGNS) {
      expect(c.adSets.reduce((a, s) => a + s.spend, 0), c.id).toBe(c.spend);
      expect(c.adSets.reduce((a, s) => a + s.leads, 0), c.id).toBe(c.leads);
    }
  });
});
