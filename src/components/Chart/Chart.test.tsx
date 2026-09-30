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
    const names = [...screen.getByRole('table').querySelectorAll('.gr-chart__group-name')].map((n) => n.textContent);
    expect(names).toEqual(['Spend', 'Leads', 'ROAS']);
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
    const groups = [...screen.getByRole('table').querySelectorAll('.gr-chart__group-name')].map((th) => th.textContent);
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

  it('⭐ each metric can compare with its OWN period -- Leads vs last month beside Spend vs last week', () => {
    localStorage.setItem('growth.tableColumns', JSON.stringify(['Leads']));
    renderChart(30);
    pick('week');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.change(screen.getByLabelText('Compare Leads with'), { target: { value: 'month' } });
    const table = screen.getByRole('table');
    /* Mixed periods: no single "earlier date" column -- each group says its days. */
    expect(table.classList.contains('is-comparing')).toBe(false);
    const spans = [...table.querySelectorAll('.gr-chart__group-span')].map((n) => n.textContent);
    expect(spans).toEqual(['Jul 7 – Aug 5', 'Jun 13 – Jul 12']);
    /* Each column's earlier total uses ITS days. */
    const lastMonthLeads = series('all', 'Leads', 30, 31).reduce((a, d) => a + d.value, 0);
    expect(table.querySelector('tfoot')!.textContent).toContain(formatMetric('Leads', lastMonthLeads));
    localStorage.clear();
  });

  it('a column can opt out ("No comparison"); the Compare control resets every column', () => {
    localStorage.setItem('growth.tableColumns', JSON.stringify(['Leads']));
    renderChart(30);
    pick('week');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.change(screen.getByLabelText('Compare Leads with'), { target: { value: 'none' } });
    expect(screen.getByRole('table').querySelector('tbody tr')!.querySelectorAll('td')).toHaveLength(1 + 3 + 1);
    pick('year');
    expect((screen.getByLabelText('Compare Leads with') as HTMLSelectElement).value).toBe('year');
    localStorage.clear();
  });
});
