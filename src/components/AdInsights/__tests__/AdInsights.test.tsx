// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AdFunnel, AdVerdict } from '../AdInsights';
import { creativesFor, creativeShare, creativeClickShare, creativeLeadShare, creativeSalesShare } from '../../../data/creative';
import { CAMPAIGNS } from '../../../data/campaigns';

afterEach(cleanup);

const adOf = (campaignId: string) => creativesFor(campaignId).find((x) => x.stage === 'Active')!;

describe('⭐ the ad page funnel (Oct 16)', () => {
  it('shows only the steps the channel reports', () => {
    const meta = render(<AdFunnel creative={adOf('c1')} campaignId="c1" channel="meta" range={30} />);
    expect(meta.container.textContent).toMatch(/Impressions.*Click-through.*Clicks.*Lead rate.*Leads.*Close rate.*Sales/);
    meta.unmount();
    const pod = render(<AdFunnel creative={adOf('c22')} campaignId="c22" channel="podcasts" range={30} />);
    expect(pod.container.textContent).not.toMatch(/Clicks|Click-through/);
    expect(pod.container.textContent).toMatch(/Leads per impression/);
    pod.unmount();
    const search = render(<AdFunnel creative={adOf('c7')} campaignId="c7" channel="paidSearch" range={30} />);
    expect(search.container.textContent).not.toMatch(/Impressions/);
  });

  it('click-through and close rate differ ad to ad, but ads still sum to their campaign', () => {
    for (const c of CAMPAIGNS) {
      const ads = creativesFor(c.id);
      const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
      const total = (f: (id: string) => number) => ads.reduce((a, x) => a + f(x.id), 0);
      expect(near(total(creativeClickShare), total(creativeShare)), c.id).toBe(true);
      expect(near(total(creativeSalesShare), total(creativeLeadShare)), c.id).toBe(true);
      for (const s of c.adSets) {
        const inSet = ads.filter((x) => x.adSetId === s.id);
        const sumOf = (f: (id: string) => number) => inSet.reduce((a, x) => a + f(x.id), 0);
        expect(near(sumOf(creativeClickShare), sumOf(creativeShare)), s.id).toBe(true);
      }
    }
    const set = creativesFor('c1').filter((x) => x.adSetId === 'c1a');
    const ctr = new Set(set.map((x) => (creativeClickShare(x.id) / creativeShare(x.id)).toFixed(4)));
    expect(ctr.size).toBeGreaterThan(1);
  });
});

describe('⭐ Growth’s call on the ad page', () => {
  it('always says something, and names what the data cannot tell you', () => {
    for (const c of CAMPAIGNS.slice(0, 6)) {
      const ad = adOf(c.id); if (!ad) continue;
      const { container, unmount } = render(<AdVerdict creative={ad} campaignId={c.id} channel={c.channel} range={30} />);
      expect(container.querySelector('.gr-adx__action')!.textContent!.length, c.id).toBeGreaterThan(3);
      expect(container.textContent).toMatch(/What this data can.t tell you/);
      unmount();
    }
  });
});
