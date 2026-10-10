// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { refreshAuth } from '../data/auth';
import { closeWelcome, openWelcome, WELCOME_KEY } from '../data/welcome';
import { endTour, TOUR } from '../data/tour';

/* jsdom lays nothing out; give every element a box, except ones a test hides. */
let hidden = new Set<string>();
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const t = (this as HTMLElement).dataset?.tour;
    const w = t && hidden.has(t) ? 0 : 120;
    return { top: 40, left: 40, width: w, height: w ? 60 : 0, right: 40 + w, bottom: 100, x: 40, y: 40, toJSON() {} } as DOMRect;
  };
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => { act(() => { endTour(); closeWelcome(); }); cleanup(); localStorage.clear(); hidden = new Set(); vi.unstubAllGlobals(); });

async function demo() {
  localStorage.setItem(WELCOME_KEY, '1');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    user: { id: 'd', seat: 'maya', name: 'Maya Okonkwo', email: 'maya@northbank.demo', role: 'member', demo: true, sandboxed: true },
    providers: {}, firstRun: false, canCreateOwner: false,
  }), { status: 200 })));
  await act(async () => { await refreshAuth(true); });
  render(<App />);
  act(() => openWelcome());
  fireEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
}
const stepCard = () => screen.getByRole('dialog', { name: /./ });

describe('the demo guide', () => {
  it('starts from the welcome card on step 1, and Next / the arrow key move on', async () => {
    await demo();
    await waitFor(() => expect(stepCard().textContent).toContain(`Step 1 of ${TOUR.length}`));
    expect(screen.getByRole('heading', { name: TOUR[0].title })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[1].title })).toBeTruthy());
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[2].title })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[1].title })).toBeTruthy());
  });

  it('switches screens by itself: the plan stop lands on Decisions', async () => {
    await demo();
    for (let i = 0; i < 3; i++) {
      await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[i].title })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[3].title })).toBeTruthy());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Decisions');
  });

  it('skips a stop whose element is not on screen (Team, on a phone)', async () => {
    hidden = new Set(['team']);
    await demo();
    const ask = TOUR.findIndex((s) => s.target === 'ask');
    for (let i = 0; i < ask; i++) {
      await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[i].title })).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    }
    await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[ask].title })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    /* The tour waits ~40 frames for an element before skipping it. */
    await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[ask + 2].title })).toBeTruthy(), { timeout: 4000 });
  });

  it('End tour closes it', async () => {
    await demo();
    await waitFor(() => expect(screen.getByRole('heading', { name: TOUR[0].title })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'End tour' }));
    expect(screen.queryByRole('heading', { name: TOUR[0].title })).toBeNull();
  });
});
