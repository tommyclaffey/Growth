// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ChannelMark } from '../ChannelMark';

afterEach(cleanup);

describe('ChannelMark', () => {
  it('uses the REAL brand asset for channels that have one', () => {
    for (const c of ['meta', 'tiktok', 'youtube', 'paidSearch'] as const) {
      const { container } = render(<ChannelMark channel={c} size={20} />);
      expect(container.querySelector('img'), `${c} must render its brand asset`).toBeTruthy();
      cleanup();
    }
  });

  it('falls back to a drawn glyph only where there is no product logo', () => {
    for (const c of ['affiliates', 'podcasts'] as const) {
      const { container } = render(<ChannelMark channel={c} size={20} />);
      expect(container.querySelector('svg'), `${c} needs a glyph`).toBeTruthy();
      cleanup();
    }
  });
});

describe('optical sizing', () => {
  it('keeps the BOX at the requested size so table columns stay aligned', () => {
    const { container } = render(<ChannelMark channel="meta" size={20} />);
    const box = container.querySelector('.gr-chmark') as HTMLElement;
    expect(box.style.width).toBe('20px');
    expect(box.style.height).toBe('20px');
  });

  it('scales the flattest mark up the most, and the tallest least', () => {
    const scaleOf = (c: 'meta' | 'tiktok' | 'youtube') => {
      const { container } = render(<ChannelMark channel={c} size={20} />);
      const v = (container.querySelector('.gr-chmark') as HTMLElement)
        .style.getPropertyValue('--gr-mark-scale');
      cleanup();
      return Number(v);
    };
    /* Meta is 38.5x24.5 and fills a third of a square box; TikTok is 32.5x36.5
       and fills nearly all of it. Equal `size` is not equal ink. */
    expect(scaleOf('meta')).toBeGreaterThan(scaleOf('youtube'));
    expect(scaleOf('youtube')).toBeGreaterThan(scaleOf('tiktok'));
  });
});
