// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Chart } from './Chart';
import { formatMetric, series, setWindowEnd, totals } from '../../data/metrics';

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
    expect(table.querySelector('thead')!.textContent).toMatch(/Spend.*Date.*Last year.*Now.*Then.*Change/s);
    expect(table.querySelector('tbody tr')!.textContent).toMatch(/Jul 14.*Jul 14, 2025/);
    expect(table.querySelector('tfoot')!.textContent).toMatch(/2025/);
  });

  it('⭐ a ratio’s total is REBUILT from its parts -- total spend over total leads, never a sum of daily CACs', () => {
    renderChart(30, 'CAC');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table').querySelector('tfoot')!.textContent).toContain(formatMetric('CAC', totals('all', 30).cac));
  });

  it('⭐ tick metrics to show them side by side; the choice is remembered; every total is the dashboard’s', () => {
    localStorage.clear();
    const { unmount } = renderChart(30);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Leads' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'ROAS' }));
    const head = screen.getByRole('table').querySelector('thead')!.textContent!;
    expect(head).toMatch(/Date.*Spend.*Leads.*ROAS/);
    const foot = screen.getByRole('table').querySelector('tfoot')!.textContent!;
    const t = totals('all', 30);
    expect(foot).toContain(formatMetric('Spend', t.spend));
    expect(foot).toContain(formatMetric('Leads', t.leads));
    expect(foot).toContain(formatMetric('ROAS', t.roas));
    expect((screen.getByRole('checkbox', { name: 'Spend' }) as HTMLInputElement).disabled).toBe(true);   // the main metric stays
    unmount();
    renderChart(30);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect((screen.getByRole('checkbox', { name: 'Leads' }) as HTMLInputElement).checked).toBe(true);
    localStorage.clear();
  });

  it('comparing: each ticked metric gets Now | Then | Change under its own name', () => {
    localStorage.setItem('growth.tableColumns', JSON.stringify(['Leads']));
    renderChart(30);
    pick('week');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const groups = [...screen.getByRole('table').querySelectorAll('th[scope="colgroup"]')].map((th) => th.textContent);
    expect(groups).toEqual(['Spend', 'Leads']);
    expect(screen.getByRole('table').querySelectorAll('tbody tr')[0].querySelectorAll('td')).toHaveLength(1 + 2 * 3);
    localStorage.clear();
  });

  it('when the data does not reach back that far, it SAYS so -- never draws zeros', () => {
    setWindowEnd(10);          // a year ending 10 days back: last year starts before the data
    renderChart(365);
    pick('year');
    expect(screen.getByText(/No data for the same days last year/)).toBeTruthy();
  });

  it('⭐ By Week: a column per week, oldest to newest, then the Total -- metrics are the rows', () => {
    localStorage.setItem('growth.tableColumns', JSON.stringify(['Leads', 'CAC']));
    renderChart(84);                       // twelve whole weeks
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    const table = screen.getByRole('table');
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads[0]).toBe('Week');
    expect(heads).toHaveLength(1 + 12 + 1);
    expect(heads.at(-2)).toBe('Aug 6–12');                 // the newest week, whole
    expect(heads.at(-1)).toBe('Total');
    const rows = [...table.querySelectorAll('tbody tr')].map((r) => r.querySelector('th')!.textContent);
    expect(rows).toEqual(['Spend', 'Leads', 'CAC']);
    /* The Total column is the window's own total -- the dashboard's figure. */
    const cac = table.querySelectorAll('tbody tr')[2].querySelectorAll('td');
    expect(cac[cac.length - 1].textContent).toBe(formatMetric('CAC', totals('all', 84).cac));
    /* Each week (after the first) carries its change against the week before. */
    expect(table.querySelectorAll('tbody tr')[0].querySelectorAll('.gr-chart__pivot-change')).toHaveLength(11);
    localStorage.clear();
  });

  it('a SHORT oldest week says so, and gets no "change" -- 2 days against 7 is not a drop', () => {
    renderChart(30);                       // 4 whole weeks + 2 days
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('thead th')[1].textContent).toMatch(/2 days/);
    const first = table.querySelectorAll('tbody tr')[0].querySelectorAll('td');
    expect(first[1].querySelector('.gr-chart__pivot-change')).toBeNull();   // week 2 vs a 2-day week: no change shown
    localStorage.clear();
  });

  it('By Month: calendar months, the partial ones marked', () => {
    renderChart(90);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    const heads = [...screen.getByRole('table').querySelectorAll('thead th')].map((th) => th.textContent);
    expect(heads).toEqual(['Month', 'May 202617 days', 'Jun 2026', 'Jul 2026', 'Aug 202612 days', 'Total']);
    localStorage.clear();
  });
});
