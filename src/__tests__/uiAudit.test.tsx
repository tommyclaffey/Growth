// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { CampaignTable } from '../components/CampaignTable/CampaignTable';
import { decodeView, encodeView } from '../data/chat';
import { setChannels } from '../data/channels';
import { CHANNEL_KEYS } from '../data/metrics';

/*
 * Regressions from the Sept 29 UI audit. Each failed before its fix.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  setChannels([...CHANNEL_KEYS]);
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('reload keeps you where you were', () => {
  it.each(['settings', 'decisions', 'reports', 'notifications', 'ads'])(
    '🐛 reloading %s does not send you to Overview', (v) => {
      window.history.replaceState(null, '', `/?v=${v}&c=meta&m=CAC&r=30`);
      render(<App />);
      expect(new URLSearchParams(window.location.search).get('v')).toBe(v);
    },
  );

  it('a real Slack share link (no v) still opens its view', () => {
    window.history.replaceState(null, '', '/?c=meta&m=CAC&r=7');
    render(<App />);
    expect(new URLSearchParams(window.location.search).get('c')).toBe('meta');
  });
});

describe('shared links', () => {
  it.each([14, 45, 75, 90])('🐛 a %d-day view round-trips through a chat message', (range) => {
    const url = encodeView({ channel: 'meta', metric: 'CAC', range }, 'https://x.example/Growth/');
    const d = decodeView(`Look at this ${url}`);
    expect(d?.view.range).toBe(range);
    expect(d?.text.trim()).toBe('Look at this');
  });
});

describe('the campaign list', () => {
  it('🐛 hides channels that are switched off', () => {
    setChannels(['meta']);
    const { container } = render(<CampaignTable />);
    expect(container.textContent).not.toMatch(/TikTok|YouTube|Podcasts/);
  });
});

describe('saved conversations', () => {
  it('🐛 malformed records cannot blank the app -- bad ones are dropped, bad messages filtered', async () => {
    localStorage.setItem('growth.conversations', JSON.stringify([
      { id: 'x1', kind: 'dm', messages: [] },                                       // no memberIds
      { id: 'x2', kind: 'dm', memberIds: ['maya', 'dk'], messages: [null, { id: 'm', authorId: 'dk' }, { id: 'ok', authorId: 'dk', body: 'hi', time: '9:00' }] },
    ]));
    vi.resetModules();
    const { allConversations } = await import('../data/conversations');
    const all = allConversations();
    expect(all.find((c) => c.id === 'x1')).toBeUndefined();
    const x2 = all.find((c) => c.id === 'x2')!;
    expect(x2.messages.map((m) => m.id)).toEqual(['ok']);
    expect(x2.readCount).toBe(1);
  });
});

describe('Escape closes one layer', () => {
  it('🐛 Escape inside Ask does not also close Chat', () => {
    window.history.replaceState(null, '', '/?v=overview');
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    const ask = document.activeElement as HTMLElement;
    fireEvent.keyDown(ask, { key: 'Escape' });
    expect(document.querySelector('.gr-chat')).not.toBeNull();
  });
});
