// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';
import { refreshAuth } from '../data/auth';
import { closeWelcome, WELCOME_KEY } from '../data/welcome';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => { act(() => closeWelcome()); cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const signIn = async (user: object) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ user, providers: {}, firstRun: false, canCreateOwner: false }), { status: 200 })));
  await act(async () => { await refreshAuth(true); });
};
const base = { id: 'x', seat: 'maya', name: 'Maya Okonkwo', email: 'maya@northbank.demo', role: 'member' };
const mount = async () => { vi.useFakeTimers(); render(<App />); await act(async () => { vi.advanceTimersByTime(500); }); vi.useRealTimers(); };

describe('the demo welcome card', () => {
  it('opens on a demo account\'s first visit, says what this is, and remembers it was seen', async () => {
    await signIn({ ...base, demo: true, sandboxed: true });
    await mount();
    const card = screen.getByRole('dialog', { name: 'Welcome to Growth' });
    expect(card.textContent).toContain('Live demo');
    expect(card.textContent).toContain('Maya Okonkwo');
    expect(within(card).getByRole('link', { name: 'Tommy Claffey' }).getAttribute('href')).toBe('https://www.tommyclaffey.com');
    expect(localStorage.getItem(WELCOME_KEY)).toBe('1');
    fireEvent.click(within(card).getByRole('button', { name: 'Start exploring' }));
    expect(screen.queryByRole('dialog', { name: 'Welcome to Growth' })).toBeNull();
  });

  it('each step goes where it says: "Review the decisions" lands on Decisions', async () => {
    await signIn({ ...base, demo: true, sandboxed: true });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /Review the decisions/ }));
    expect(screen.queryByRole('dialog', { name: 'Welcome to Growth' })).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Decisions');
  });

  it('does not reappear once seen, and the DEMO pill brings it back', async () => {
    localStorage.setItem(WELCOME_KEY, '1');
    await signIn({ ...base, demo: true, sandboxed: true });
    await mount();
    expect(screen.queryByRole('dialog', { name: 'Welcome to Growth' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Demo account: show the welcome tour' })[0]);
    expect(screen.getByRole('dialog', { name: 'Welcome to Growth' })).toBeTruthy();
  });

  it('🛑 never on a real account', async () => {
    await signIn({ ...base, role: 'owner', email: 'tommy@example.com' });
    await mount();
    expect(screen.queryByRole('dialog', { name: 'Welcome to Growth' })).toBeNull();
    expect(screen.queryByRole('button', { name: /show the welcome tour/ })).toBeNull();
  });
});
