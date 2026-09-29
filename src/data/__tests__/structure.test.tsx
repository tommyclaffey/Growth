// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { applyStructure } from '../structure';
import { CAMPAIGNS } from '../campaigns';
import { campaignTotals } from '../campaignSeries';
import { decisions } from '../decisions';
import { ask } from '../assistant';
import { notifications } from '../notifications';
import { hydrate, TOTAL_POINTS, type DayRow } from '../metrics';
import { seededSource } from '../sources/seeded';
import { CampaignDetail } from '../../screens/CampaignDetail';
import { CampaignTable } from '../../components/CampaignTable/CampaignTable';
import type { SourceCampaign } from '../source';

afterEach(() => {
  cleanup();
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
  applyStructure(undefined);
});

const days = (spend: number, leads: number): DayRow[] => Array.from({ length: TOTAL_POINTS },
  () => ({ spend, impressions: spend * 80, clicks: leads * 20, leads, sales: leads / 10, revenue: spend * 3 }));

const real: SourceCampaign[] = [
  { id: 'meta-123', name: 'Spring Leads — Broad', channel: 'meta', stage: 'Active', objective: 'Conversions', rows: days(100, 4) },
  { id: 'meta-456', name: 'Retargeting — Site Visitors', channel: 'meta', stage: 'Paused', objective: 'Sales', rows: days(50, 1) },
];

function load() {
  const sum = real[0].rows.map((r, i) => ({
    spend: r.spend + real[1].rows[i].spend, impressions: r.impressions + real[1].rows[i].impressions,
    clicks: r.clicks + real[1].rows[i].clicks, leads: r.leads + real[1].rows[i].leads,
    sales: r.sales + real[1].rows[i].sales, revenue: r.revenue + real[1].rows[i].revenue,
  }));
  hydrate({ rows: { meta: sum }, periodEnd: '2026-09-28', currency: 'USD' });
  applyStructure(real);
}

describe('a real account brings its OWN campaigns', () => {
  it('⭐ the demo campaigns are replaced -- real numbers never wear demo names', () => {
    load();
    expect(CAMPAIGNS.map((c) => c.name)).toEqual(['Spring Leads — Broad', 'Retargeting — Site Visitors']);
    expect(CAMPAIGNS.some((c) => c.name.startsWith('Advantage+'))).toBe(false);
  });

  it('each campaign reports its own days, not a share of the channel', () => {
    load();
    expect(campaignTotals('meta-123', 30).spend).toBe(3000);
    expect(campaignTotals('meta-123', 30).leads).toBe(120);
    expect(campaignTotals('meta-456', 7).spend).toBe(350);
  });

  it('the engine, notifications and the assistant run on it without a seed campaign in sight', () => {
    load();
    expect(() => decisions(30, ['meta'])).not.toThrow();
    expect(() => notifications(['meta'])).not.toThrow();
    const a = ask('What should I do next?', 30);
    expect(a.text).not.toMatch(/Advantage\+|Evergreen/);
  });

  it('campaign screens render real campaigns that have no ad sets or ads yet', () => {
    load();
    const { container } = render(<CampaignTable wideColumns />);
    expect(container.textContent).toContain('Spring Leads — Broad');
    cleanup();
    const page = render(<CampaignDetail id="meta-123" metric="Spend" range={30} onBack={vi.fn()} />);
    expect(page.container.textContent).toContain('Spring Leads — Broad');
  });

  it('restoring the seed brings the demo campaigns back', () => {
    load();
    applyStructure(undefined);
    expect(CAMPAIGNS.some((c) => c.name === 'Advantage+ — Evergreen Signups')).toBe(true);
  });
});
