// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CampaignPreview } from '../CampaignPreview';
import { CAMPAIGNS } from '../../../data/campaigns';

afterEach(cleanup);

describe('⭐ Running now is full (Oct 12)', () => {
  it('shows six running ads on every channel that has a live campaign', () => {
    for (const ch of ['meta', 'tiktok', 'youtube', 'paidSearch', 'affiliates'] as const) {
      const { container, unmount } = render(<CampaignPreview channel={ch} range={30} onOpenAd={() => {}} />);
      expect(container.querySelectorAll('.gr-cpreview'), ch).toHaveLength(6);
      unmount();
    }
  });

  it('opens the ad inside its own campaign and ad set', () => {
    const opened: { id: string; campaignId: string; adSetId: string }[] = [];
    const { container } = render(<CampaignPreview channel="meta" range={30} onOpenAd={(a) => opened.push(a)} />);
    fireEvent.click(container.querySelector('.gr-cpreview')!);
    const [a] = opened;
    const c = CAMPAIGNS.find((x) => x.id === a.campaignId)!;
    expect(c.channel).toBe('meta');
    expect(c.adSets.some((s) => s.id === a.adSetId)).toBe(true);
    expect(a.id.startsWith(a.adSetId)).toBe(true);
  });
});

it('never shows the same picture twice on a channel', () => {
  for (const ch of ['meta', 'tiktok', 'youtube', 'paidSearch', 'affiliates'] as const) {
    const { container, unmount } = render(<CampaignPreview channel={ch} range={30} onOpenAd={() => {}} />);
    const srcs = [...container.querySelectorAll('.gr-cpreview__art img')].map((i) => i.getAttribute('src'));
    expect(new Set(srcs).size, ch).toBe(srcs.length);
    unmount();
  }
});
