import { describe, it, expect } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import { campaignRows, campaignTotals } from '../campaignSeries';
import { CHANNEL_KEYS, RANGES, rowsFor, setActiveChannels, totals } from '../metrics';

const ALL = [...CHANNEL_KEYS];
const reset = () => setActiveChannels(ALL);

describe('campaigns reconcile with their channel', () => {
  it('a channel’s campaigns sum to that channel EVERY DAY, not just in total', () => {
    reset();
    /* The guarantee that makes campaign numbers trustworthy. A dashboard whose
       channel row disagrees with its own campaign rows has told the reader not
       to trust either, and nobody can say which is wrong. */
    for (const ch of ALL) {
      const mine = CAMPAIGNS.filter((c) => c.channel === ch);
      if (mine.length === 0) continue;
      for (const range of RANGES) {
        const channel = rowsFor(ch, range);
        const parts = mine.map((c) => campaignRows(c.id, range));
        channel.forEach((row, d) => {
          const summed = parts.reduce((a, p) => a + p[d].spend, 0);
          expect(summed).toBeCloseTo(row.spend, 6);
        });
      }
    }
  });

  it('campaign period spend sums to the channel period spend', () => {
    reset();
    for (const ch of ALL) {
      const mine = CAMPAIGNS.filter((c) => c.channel === ch);
      if (mine.length === 0) continue;
      for (const range of RANGES) {
        const summed = mine.reduce((a, c) => a + campaignTotals(c.id, range).spend, 0);
        expect(summed).toBeCloseTo(totals(ch, range).spend, 4);
      }
    }
  });

  it('30-day campaign spend still matches the figure shown in the table', () => {
    reset();
    for (const c of CAMPAIGNS) {
      expect(campaignTotals(c.id, 30).spend).toBeCloseTo(c.spend, 0);
    }
  });

  it('every campaign metric is finite for every range', () => {
    reset();
    for (const c of CAMPAIGNS) {
      for (const r of RANGES) {
        const t = campaignTotals(c.id, r);
        for (const v of [t.spend, t.leads, t.cac, t.roas, t.revenue]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });

  it('responds to the range picker at all', () => {
    reset();
    const c = CAMPAIGNS[0];
    /* The original defect: campaigns were static totals, so 7 days and 30 days
       returned the same number while every other panel changed. */
    expect(campaignTotals(c.id, 7).spend).not.toBeCloseTo(campaignTotals(c.id, 30).spend, 0);
  });
});
