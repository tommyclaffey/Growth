// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Chart } from './Chart';
import { series, setWindowEnd } from '../../data/metrics';

afterEach(() => { cleanup(); setWindowEnd(0); });

function renderChart(range = 30, metric: 'Spend' | 'CAC' = 'Spend') {
  return render(
    <Chart channel="all" metric={metric} data={series('all', metric, range)}
           compareSeries={(m) => series('all', m, range)}
           periodSeries={(m, sh) => series('all', m, range, sh)} />,
  );
}
const pick = (v: string) => fireEvent.change(screen.getByLabelText(/Compare with another metric or an earlier period/), { target: { value: v } });

describe('the chart: table view and earlier periods', () => {
  it('⭐ Table is a third view beside Bar and Line -- every day, and a total', () => {
    renderChart(30);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const table = screen.getByRole('table', { hidden: false });
    expect(table.querySelectorAll('tbody tr')).toHaveLength(30);
    expect(table.textContent).toContain('$160,780');          // the published 30-day total
  });

  it('⭐ compare to the same days last week / month / year -- one Compare control, a group of its own', () => {
    renderChart(30);
    for (const label of ['Last week', 'Last month', 'Last year']) {
      expect(screen.getByRole('option', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('group', { name: 'Same days earlier' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Another metric' })).toBeTruthy();
  });

  it('the table puts each day beside the same day earlier, with the change -- and the year when it differs', () => {
    renderChart(30);
    pick('year');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const table = screen.getByRole('table');
    expect(table.querySelector('thead')!.textContent).toMatch(/Last year.*Spend.*Change/);
    expect(table.querySelector('tbody tr')!.textContent).toMatch(/Jul 14.*Jul 14, 2025/);
    expect(table.querySelector('tfoot')!.textContent).toMatch(/2025/);
  });

  it('a ratio gets no total -- a sum of daily CACs is not the period’s CAC', () => {
    renderChart(30, 'CAC');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table').querySelector('tfoot')).toBeNull();
  });

  it('when the data does not reach back that far, it SAYS so -- never draws zeros', () => {
    setWindowEnd(10);          // a year ending 10 days back: last year starts before the data
    renderChart(365);
    pick('year');
    expect(screen.getByText(/No data for the same days last year/)).toBeTruthy();
  });
});
