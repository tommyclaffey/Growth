// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import { CHANNEL_KEYS } from '../data/metrics';
import { setChannels } from '../data/channels';

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
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('an alert opens onto the number it states', () => {
  it('"Meta CAC rose 42%" opens Meta at 7 days on CAC -- where the card says 42%', () => {
    setChannels([...CHANNEL_KEYS]);
    window.history.replaceState(null, '', '/?v=notifications&r=30&m=Spend');
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /^Meta CAC rose 42%/ }));
    const q = new URLSearchParams(window.location.search);
    expect(q.get('v')).toBe('channels');
    expect(q.get('c')).toBe('meta');
    expect(q.get('r')).toBe('7');
    expect(q.get('m')).toBe('CAC');
    expect(container.textContent).toContain('42%');
  });
});
