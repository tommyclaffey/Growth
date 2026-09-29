// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { RangePicker } from '../components/RangePicker/RangePicker';
import {
  DAY_ISO, compareShift, windowFromDates, delta, hasWindow, isRange, rangeLabel, rowsFor, setWindowEnd, totals, windowLabels,
} from '../data/metrics';
import { readUrlState, urlStateQuery } from '../data/urlState';

afterEach(cleanup);

describe('custom date ranges (Phase 3)', () => {
  it('any whole 1-365 days is a range (two years of history); 0, 366 and fractions are not', () => {
    expect([1, 14, 45, 90, 365].every(isRange)).toBe(true);
    expect([0, 366, 7.5, -3, NaN].some(isRange)).toBe(false);
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
    fireEvent.click(screen.getByRole('option', { name: 'Custom…' }));
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
    fireEvent.click(screen.getByRole('option', { name: 'Custom…' }));
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '400' } });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('spinbutton')).toBeTruthy();     // still open, not applied
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /Last 30 days/ })).toBeTruthy();
  });
});

describe('custom DATES -- a start and an end, anywhere in two years', () => {
  afterEach(() => setWindowEnd(0));

  it('dates become a window: length, and how far back it ends', () => {
    const end = DAY_ISO[DAY_ISO.length - 1];                         // 2026-08-12
    expect(windowFromDates('2026-07-01', '2026-07-31')).toEqual({ range: 31, endBack: 12 });
    expect(windowFromDates('2026-08-12', end)).toEqual({ range: 1, endBack: 0 });
    expect(windowFromDates('2026-07-31', '2026-07-01')).toBeNull();    // backwards
    expect(windowFromDates('2020-01-01', '2020-01-31')).toBeNull();    // before the data
    expect(windowFromDates('2025-01-01', '2026-08-01')).toBeNull();    // longer than a year
  });

  it('every figure follows the window -- totals, labels, the words', () => {
    setWindowEnd(12);
    expect(rowsFor('meta', 31)).toHaveLength(31);
    expect(rangeLabel(31)).toBe('Jul 1, 2026 – Jul 31, 2026');
    expect(windowLabels(31)[0]).toBe('Jul 1');
    expect(totals('meta', 31).spend).not.toBe(totals('meta', 30).spend);
    setWindowEnd(0);
    expect(rangeLabel(31)).toBe('Last 31 days');
  });

  it('the URL carries the END DATE, so a shared link means the same days', () => {
    expect(readUrlState('?r=31&to=2026-07-31')).toMatchObject({ range: 31, endBack: 12 });
    expect(readUrlState('?r=31&to=1999-01-01').endBack).toBeUndefined();
  });

  it('compare to last week / month / year: the same dates, earlier', () => {
    expect(compareShift('week')).toBe(7);
    expect(compareShift('month')).toBe(31);    // Aug 12 -> Jul 12
    expect(compareShift('year')).toBe(365);
    expect(hasWindow(90, 0, 365)).toBe(true);  // two years: last year exists
  });

  it('⭐ the picker: Custom dates… → click the start day, click the end day → Apply', () => {
    let got: [number, number | undefined] | null = null;
    render(<RangePicker value={30} onChange={(r, e) => { got = [r, e]; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Last 30 days/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom dates…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jul 1, 2026' }));
    expect(screen.getByRole('status').textContent).toMatch(/pick the end day/);
    fireEvent.click(screen.getByRole('button', { name: 'Jul 31, 2026' }));
    expect(screen.getByRole('status').textContent).toMatch(/Jul 1, 2026 – Jul 31, 2026 · 31 days/);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(got).toEqual([31, 12]);
  });

  it('clicking the end first works too; days after the data are disabled', () => {
    let got: [number, number | undefined] | null = null;
    render(<RangePicker value={30} onChange={(r, e) => { got = [r, e]; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Last 30 days/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom dates…' }));
    expect((screen.getByRole('button', { name: 'Aug 13, 2026' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Aug 10, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aug 4, 2026' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(got).toEqual([7, 2]);
  });

  it('presets: Last month is the whole previous calendar month', () => {
    let got: [number, number | undefined] | null = null;
    render(<RangePicker value={30} onChange={(r, e) => { got = [r, e]; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Last 30 days/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom dates…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Last month' }));
    expect(screen.getByRole('status').textContent).toMatch(/Jul 1, 2026 – Jul 31, 2026/);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(got).toEqual([31, 12]);
  });

  it('Escape closes the calendar without applying', () => {
    let got: unknown = null;
    render(<RangePicker value={30} onChange={(r) => { got = r; }} />);
    fireEvent.click(screen.getByRole('button', { name: /Last 30 days/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Custom dates…' }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Choose dates' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(got).toBeNull();
  });
});
