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
    expect(screen.queryByRole('tablist')).toBeNull();
    rerender(<ChannelTable rows={rows} metric="Spend" onMetricChange={onMetric} />);
    fireEvent.click(screen.getByRole('tab', { name: 'CAC' }));
    expect(onMetric).toHaveBeenCalledWith('CAC');
  });

  it('says what is inside each channel', () => {
    render(<ChannelTable rows={rows} />);
    expect(screen.getByText('2 campaigns')).toBeTruthy();
  });
});
