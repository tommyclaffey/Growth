// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); localStorage.clear(); delete document.documentElement.dataset.theme; });

describe('the light / dark button in the top bar', () => {
  it('flips the theme in one press, names where it goes, and remembers it', () => {
    localStorage.setItem('growth.theme', 'light');
    render(<App />);
    const toDark = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.click(toDark);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('growth.theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('growth.theme')).toBe('light');
  });
});
