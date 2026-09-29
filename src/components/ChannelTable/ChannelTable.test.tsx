// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChannelTable, type ChannelRow } from './ChannelTable';

afterEach(cleanup);

const rows: ChannelRow[] = [
  { key: 'meta', name: 'Meta', spend: 600, leads: 20, cac: 30, roas: 4, delta: 42, trend: [1, 2], sub: '2 campaigns' },
  { key: 'tiktok', name: 'TikTok', spend: 400, leads: 20, cac: 20, roas: 2, delta: -5, trend: [2, 1], sub: '1 campaign' },
];

describe('ChannelTable', () => {
  it('names what the change column measures, not "Δ Prev"', () => {
    render(<ChannelTable rows={rows} metric="CAC" range={7} />);
    expect(screen.getByRole('button', { name: /Δ CAC/ })).toBeTruthy();
    expect(screen.queryByText(/Δ Prev/)).toBeNull();
  });

  it('the total row sums, then divides once -- blended, not averaged', () => {
    const { container } = render(<ChannelTable rows={rows} metric="Spend" total={{ delta: 3, trend: [1, 2] }} />);
    const foot = container.querySelector('tfoot')!.textContent!;
    expect(foot).toContain('$1,000');      // spend
    expect(foot).toContain('40');          // leads
    expect(foot).toContain('$25.00');      // 1000 / 40, NOT the mean of 30 and 20
    expect(foot).toContain('3.2x');        // (600*4 + 400*2) / 1000
  });

  it('offers its own metric switch only when it can change the metric', () => {
    const onMetric = vi.fn();
    const { rerender } = render(<ChannelTable rows={rows} metric="Spend" />);
    expect(screen.queryByRole('combobox')).toBeNull();
    rerender(<ChannelTable rows={rows} metric="Spend" onMetricChange={onMetric} />);
    const select = screen.getByRole('combobox');
    /* More than the six funnel metrics: rates and costs too. */
    expect([...select.querySelectorAll('option')].map((o) => o.textContent))
      .toEqual(['Spend', 'Impressions', 'Clicks', 'Leads', 'Sales', 'CTR', 'CPC', 'CPM', 'CVR', 'CAC', 'ROAS']);
    fireEvent.change(select, { target: { value: 'CTR' } });
    expect(onMetric).toHaveBeenCalledWith('CTR');
  });

  it('says what is inside each channel', () => {
    render(<ChannelTable rows={rows} />);
    expect(screen.getByText('2 campaigns')).toBeTruthy();
  });

  it('the trend column is ROAS, whatever the change column shows', () => {
    const { container } = render(<ChannelTable rows={rows} metric="CTR" />);
    expect([...container.querySelectorAll('thead th')].map((t) => t.textContent)).toContain('ROAS trend');
  });

  it('a channel that cannot report the metric shows a dash, not 0%', () => {
    const podcast: ChannelRow = { key: 'podcasts', name: 'Podcasts', spend: 100, leads: 1, cac: 100, roas: 2, delta: null, trend: [1] };
    render(<ChannelTable rows={[...rows, podcast]} metric="CTR" />);
    const dash = screen.getByTitle('Podcasts does not report CTR');
    expect(dash.textContent).toBe('—');
  });
});
