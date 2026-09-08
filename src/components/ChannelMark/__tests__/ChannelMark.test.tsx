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

describe('the mark can never be cropped', () => {
  it('keeps the box at the requested size so table columns stay aligned', () => {
    const { container } = render(<ChannelMark channel="meta" size={20} />);
    const box = container.querySelector('.gr-chmark') as HTMLElement;
    expect(box.style.width).toBe('20px');
    expect(box.style.height).toBe('20px');
  });

  it('never sets an inline scale on the box', () => {
    /* An optical-scale factor lived here and cropped the flatter marks: it
       pushed the image past 100% of its container and depended on overflow
       staying visible, which is false inside cards, table cells and media
       bands. A logo that is cut off is worse than one that is small. */
    for (const c of ['meta', 'tiktok', 'youtube', 'paidSearch'] as const) {
      const { container } = render(<ChannelMark channel={c} size={20} />);
      const box = container.querySelector('.gr-chmark') as HTMLElement;
      expect(box.style.getPropertyValue('--gr-mark-scale'), c).toBe('');
      expect(box.style.transform, c).toBe('');
      cleanup();
    }
  });
});
