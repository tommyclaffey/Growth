// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { campaignIn } from '../assistant';
import { applyStructure } from '../structure';
import type { SourceCampaign } from '../source';

afterEach(() => applyStructure(undefined));
const rows = Array.from({ length: 30 }, () => ({ spend: 1, impressions: 1, clicks: 1, leads: 1, sales: 0, revenue: 1 }));
const camp = (id: string, name: string): SourceCampaign => ({ id, name, channel: 'meta', stage: 'Active', objective: 'Conversions', rows });

describe('which campaign a question names -- at real-account scale', () => {
  it('🐛 long shared prefixes: the full name wins, not the first 14 characters', () => {
    applyStructure([
      camp('meta-1', 'CA | Prospecting | Site Visitors 30d | v6'),
      camp('meta-2', 'CA | Prospecting | Lookalike 3% | v10'),
    ]);
    expect(campaignIn("What's going on with CA | Prospecting | Lookalike 3% | v10?")?.id).toBe('meta-2');
  });

  it('🐛 "Cluster 21" is not "Cluster 2" -- the longest full match wins', () => {
    applyStructure([camp('g-2', 'Cluster 2'), camp('g-21', 'Cluster 21')]);
    expect(campaignIn('How is Cluster 21 doing?')?.id).toBe('g-21');
    expect(campaignIn('How is Cluster 2 doing?')?.id).toBe('g-2');
  });

  it('a short mention still finds its campaign -- and a tie is not a guess', () => {
    expect(campaignIn('What about Tax Season?')?.name).toBe('Tax Season — Prospecting');     // the demo
    applyStructure([camp('a', 'Spring Sale — Broad'), camp('b', 'Spring Sale — Retargeting')]);
    expect(campaignIn('how is spring sale doing')).toBeUndefined();
  });
});
