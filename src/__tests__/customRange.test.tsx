// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RangePicker } from '../components/RangePicker/RangePicker';
import { delta, isRange, rangeLabel, rowsFor, totals } from '../data/metrics';
import { readUrlState, urlStateQuery } from '../data/urlState';

afterEach(cleanup);

describe('custom date ranges (Phase 3)', () => {
  it('any whole 1-90 days is a range; 0, 91 and fractions are not', () => {
    expect([1, 14, 45, 90].every(isRange)).toBe(true);
    expect([0, 91, 7.5, -3, NaN].some(isRange)).toBe(false);
    expect(rangeLabel(14)).toBe('Last 14 days');
    expect(rangeLabel(1)).toBe('Last day');
  });

  it('a 14-day window computes, and compares with the 14 days before it', () => {
    expect(rowsFor('meta', 14)).toHaveLength(14);
    expect(rowsFor('meta', 14, 1)).toHaveLength(14);
    expect(rowsFor('meta', 14, 1)).toEqual(rowsFor('meta', 28).slice(0, 14));
    expect(Number.isFinite(delta('meta', 'CAC', 14))).toBe(true);
    expect(totals('all', 14).spend).toBeGreaterThan(totals('all', 7).spend);
  });

  it('a custom range survives the URL; nonsense falls back', () => {
    const q = urlStateQuery({ nav: 'overview', channel: null, metric: 'Spend', range: 14, campaign: null, adSet: null, ad: null });
    expect(readUrlState(`?${q}`).range).toBe(14);
    expect(readUrlState('?r=500').range).toBeUndefined();
  });

  it('the picker: Custom… → type 21 → Enter applies it; the menu then shows it as chosen', () => {
    function P() { const [r, setR] = useState(30); return <RangePicker value={r} onChange={setR} />; }
    render(<P />);
    fireEvent.click(screen.getByRole('button', { name: /Last 30 days/ }));
    fireEvent.click(screen.getByRole('option', { name: /Custom/ }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '21' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('button', { name: /Last 21 days/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Last 21 days/ }));
    expect(screen.getByRole('option', { name: /Custom: 21 days/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('an out-of-range entry is refused, and Escape cancels', () => {
    function P() { const [r, setR] = useState(30); return <RangePicker value={r} onChange={setR} />; }
    render(<P />);
    fireEvent.click(screen.getByRole('button', { name: /Last 30 days/ }));
    fireEvent.click(screen.getByRole('option', { name: /Custom/ }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '400' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('spinbutton')).toBeTruthy();     // still open, not applied
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /Last 30 days/ })).toBeTruthy();
  });
});
