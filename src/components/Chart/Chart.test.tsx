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

  it('⭐ a ratio’s total is REBUILT from its parts -- total spend over total leads, never a sum of daily CACs', () => {
    renderChart(30, 'CAC');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByRole('table').querySelector('.gr-chart__total')!.textContent).toContain(formatMetric('CAC', totals('all', 30).cac));
  });

  it('⭐ tick metrics to show them side by side; the choice is remembered; every total is the dashboard’s', () => {
    localStorage.clear();
    const { unmount } = renderChart(30);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    /* ⭐ Every metric starts ON, until someone turns one off (Sept 30). */
    for (const m of ['Spend', 'Clicks', 'Leads', 'Sales', 'CAC', 'ROAS']) {
      expect((screen.getByRole('checkbox', { name: m }) as HTMLInputElement).checked, m).toBe(true);
    }
    for (const m of ['Spend', 'Clicks', 'Sales', 'CAC']) fireEvent.click(screen.getByRole('checkbox', { name: m }));
    /* The last one ticked cannot be unticked: an empty table answers nothing. */
    fireEvent.click(screen.getByRole('checkbox', { name: 'ROAS' }));
    expect((screen.getByRole('checkbox', { name: 'Leads' }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'ROAS' }));
    const head = screen.getByRole('table').querySelector('thead tr')!.textContent!;
    expect(head).toMatch(/Date.*Leads.*ROAS/);
    expect(head).not.toMatch(/Spend/);
    const foot = screen.getByRole('table').querySelector('.gr-chart__total')!.textContent!;
    const t = totals('all', 30);
    expect(foot).toContain(formatMetric('Leads', t.leads));
    expect(foot).toContain(formatMetric('ROAS', t.roas));
    unmount();
    renderChart(30);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect((screen.getByRole('checkbox', { name: 'Leads' }) as HTMLInputElement).checked).toBe(true);
    /* A choice made is remembered -- it does not snap back to everything. */
    expect((screen.getByRole('checkbox', { name: 'Spend' }) as HTMLInputElement).checked).toBe(false);
    localStorage.clear();
  });

  it('⭐ the table has its own controls only -- no metric buttons, no Compare, no legend; it follows the date picker', () => {
    renderChart(30);
    pick('year');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.queryByLabelText(/Compare with another metric or an earlier period/)).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Metric' })).toBeNull();
    expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('By day');
    expect(screen.getByRole('table').textContent).not.toMatch(/Then|Last year/);
    fireEvent.click(screen.getByRole('button', { name: 'Line chart' }));
    expect(screen.getByLabelText(/Compare with another metric or an earlier period/)).toBeTruthy();
  });
  it('when the data does not reach back that far, it SAYS so -- never draws zeros', () => {
    setWindowEnd(10);          // a year ending 10 days back: last year starts before the data
    renderChart(365);
    pick('year');
    expect(screen.getByText(/No data for the same days last year/)).toBeTruthy();
  });

  /* ⭐ Sept 30: PERIODS DOWN, METRICS ACROSS -- for Day, Week and Month alike.
     It was a column per week; the eye compares down a column far more easily,
     and periods are the long list (52 weeks, 365 days) while metrics are six. */
  const periodRows = (table: HTMLElement) =>
    [...table.querySelectorAll('tbody tr')].map((r) => r.querySelector('th')!.textContent);

  it('⭐ By Week: a ROW per week, newest first, the Total pinned above them -- metrics are the columns', () => {
    localStorage.setItem('growth.tableColumns', JSON.stringify(['Leads', 'CAC']));
    renderChart(84);                       // twelve whole weeks
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    const table = screen.getByRole('table');
    const heads = [...table.querySelector('thead tr')!.querySelectorAll('th')].map((th) => th.textContent);
    expect(heads).toEqual(['Week', 'Leads', 'CAC']);
    const rows = periodRows(table);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toBe('Aug 6–12');                       // the newest week on top
    /* The Total row is the window's own total -- the dashboard's figure. */
    const total = table.querySelector('.gr-chart__total')!;
    expect(total.querySelector('th')!.textContent).toBe('Total');
    expect(total.querySelectorAll('td')[1].textContent).toBe(formatMetric('CAC', totals('all', 84).cac));
    /* Each week except the oldest carries its change against the week before,
       BESIDE the figure. */
    const changed = [...table.querySelectorAll('tbody tr')]
      .map((r) => r.querySelectorAll('td')[0].querySelector('.gr-chart__change')!.textContent);
    expect(changed.filter(Boolean)).toHaveLength(11);
    expect(changed.at(-1)).toBe('');
    localStorage.clear();
  });

  it('a SHORT oldest week says so, and gets no "change" -- 2 days against 7 is not a drop', () => {
    renderChart(30);                       // 4 whole weeks + 2 days
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    const table = screen.getByRole('table');
    const body = [...table.querySelectorAll('tbody tr')];
    expect(body.at(-1)!.querySelector('th')!.textContent).toMatch(/2 days/);   // oldest, at the bottom
    /* The week above it is whole, but its "before" is 2 days: no change shown. */
    expect(body.at(-2)!.querySelector('.gr-chart__change')!.textContent).toBe('');
    localStorage.clear();
  });

  it('By Month: calendar months, newest first, the partial ones marked', () => {
    renderChart(90);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    expect(periodRows(screen.getByRole('table'))).toEqual(['Aug 202612 days', 'Jul 2026', 'Jun 2026', 'May 202617 days']);
    localStorage.clear();
  });

  it('By Day: newest day first, no change column -- a day against the day before is noise', () => {
    localStorage.clear();
    renderChart(30);
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const table = screen.getByRole('table');
    expect(periodRows(table)[0]).toBe(series('all', 'Spend', 30).at(-1)!.label);
    expect(table.querySelector('.gr-chart__change')).toBeNull();
  });
});

describe('🐛 the chart only offers what the channel can produce', () => {
  it('Podcasts: no Clicks in the toggle, the compare list or the table', async () => {
    const { chartMetricsFor, plottable } = await import('../../data/metrics');
    const ms = chartMetricsFor('podcasts');
    expect(ms).not.toContain('Clicks');
    expect(plottable('podcasts', 'Clicks')).toBe('Leads');
    expect(plottable('podcasts', 'CAC')).toBe('CAC');
    render(
      <Chart channel="podcasts" metric="Leads" metrics={ms} data={series('podcasts', 'Leads', 30)}
             compareSeries={(m) => series('podcasts', m, 30)} />,
    );
    expect(screen.queryByRole('tab', { name: 'Clicks' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Clicks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.queryByRole('checkbox', { name: 'Clicks' })).toBeNull();
  });

  it('a channel with clicks keeps them, and so does All channels', async () => {
    const { chartMetricsFor } = await import('../../data/metrics');
    expect(chartMetricsFor('meta')).toContain('Clicks');
    expect(chartMetricsFor('all')).toContain('Clicks');
  });
});
