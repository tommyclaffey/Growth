// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import App from '../App';
import { decisions } from '../data/decisions';
import { ALL_CHANNELS } from '../data/blended';
import { CHANNEL_KEYS } from '../data/metrics';
import { setChannels } from '../data/channels';
import { adSetById } from '../data/adSets';
import { creativeById } from '../data/creative';
import { flags, removeFlag } from '../data/attention';

/* The whole app, because "go back to the item" is NAVIGATION -- the Decisions
   screen only hands over a target; App decides where that lands. */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
});
afterEach(() => {
  cleanup();
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

function cardFor(container: HTMLElement, action: string) {
  return [...container.querySelectorAll('.gr-dec__card')]
    .find((el) => el.textContent!.includes(action)) as HTMLElement;
}

describe('"Go to" lands on the decided item', () => {
  it('an ad decision opens that ad, with its ad set and campaign behind it', () => {
    setChannels([...CHANNEL_KEYS]);
    const c = decisions(30, ALL_CHANNELS).find((x) => x.target.kind === 'ad')!;
    expect(c).toBeDefined();          // no silent skip -- seeded data has several
    window.history.replaceState(null, '', '/?v=decisions');
    const { container } = render(<App />);
    fireEvent.click(within(cardFor(container, c.action)).getByRole('button', { name: /^Go to/ }));
    const owner = creativeById(c.target.id)!;
    expect(container.querySelector('.gr-dec__card')).toBeNull();
    /* Back names the AD SET -- the whole chain above was set, not skipped. */
    expect(container.querySelector('.gr-crumb')!.textContent)
      .toContain(adSetById(owner.creative.adSetId)!.adSet.name);
    expect(container.textContent).toContain(owner.creative.headline);
  });

  it('a channel decision opens that channel', () => {
    setChannels([...CHANNEL_KEYS]);
    const c = decisions(30, ALL_CHANNELS).find((x) => x.target.kind === 'channel')!;
    expect(c).toBeDefined();
    window.history.replaceState(null, '', '/?v=decisions');
    const { container } = render(<App />);
    fireEvent.click(within(cardFor(container, c.action)).getByRole('button', { name: /^Go to/ }));
    expect(window.location.search).toMatch(/v=channels/);
  });

  it('an account decision opens Overview', () => {
    setChannels([...CHANNEL_KEYS]);
    const c = decisions(30, ALL_CHANNELS).find((x) => x.target.kind === 'account')!;
    expect(c).toBeDefined();
    window.history.replaceState(null, '', '/?v=decisions');
    const { container } = render(<App />);
    fireEvent.click(within(cardFor(container, c.action)).getByRole('button', { name: 'Go to all channels →' }));
    expect(window.location.search).toMatch(/v=overview|^$/);
  });
});
