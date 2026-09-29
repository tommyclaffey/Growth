// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Reports } from '../Reports';
import {
  WINDOW, exportChannels, formatRun, nextRun, removeReport, reports, resetReportStages, scopeLabel, setReportStage,
} from '../../data/reports';
import { formatMetric } from '../../data/metrics';
import { buildCsv } from '../../data/exportCsv';
import { CHANNEL_KEYS, DAY_LABELS, setActiveChannels, totals } from '../../data/metrics';
import { setChannels } from '../../data/channels';

afterEach(() => {
  cleanup();
  for (const r of reports().filter((x) => x.own)) removeReport(r.id);
  resetReportStages();
  localStorage.clear();
  setChannels([...CHANNEL_KEYS]);
});

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayNum = (label: string) => {
  const [m, d] = label.split(' ');
  return MONTHS.indexOf(m) * 100 + Number(d);
};

describe('a report exports what its row says', () => {
  it('🐛 "TikTok · YouTube" exports BOTH channels, not TikTok alone', () => {
    const r = reports().find((x) => x.name === 'Creator channel blended')!;
    expect(scopeLabel(r)).toBe('TikTok · YouTube');
    const csv = buildCsv(exportChannels(r, [...CHANNEL_KEYS])!, WINDOW[r.cadence]);
    expect(csv).toMatch(/,TikTok,/);
    expect(csv).toMatch(/,YouTube,/);
    /* The totals row is the two channels summed, not either one. */
    const spend = totals('tiktok', 30).spend + totals('youtube', 30).spend;
    expect(csv.split('\n').pop()).toContain(spend.toFixed(2));
  });

  it('the window follows the cadence -- a weekly report holds 7 days', () => {
    const weekly = reports().find((x) => x.cadence === 'Weekly')!;
    const csv = buildCsv(exportChannels(weekly, [...CHANNEL_KEYS])!, WINDOW[weekly.cadence]);
    expect(csv.split('\n').pop()).toMatch(/^Total \(7 days\)/);
    expect(WINDOW.Quarterly).toBe(90);
  });

  it('no report claims to have run after the last day of data', () => {
    const last = dayNum(DAY_LABELS[DAY_LABELS.length - 1]);
    for (const r of reports()) if (r.lastRun) expect(dayNum(r.lastRun)).toBeLessThanOrEqual(last);
  });

  it('a switched-off channel drops out; a report with nothing left cannot export', () => {
    const meta = reports().find((x) => x.name === 'Meta deep dive')!;
    expect(exportChannels(meta, ['tiktok'])).toBeNull();
    const creator = reports().find((x) => x.name === 'Creator channel blended')!;
    expect(exportChannels(creator, ['tiktok', 'meta'])).toEqual(['tiktok']);
  });
});

describe('the Reports screen', () => {
  it('has exactly one Export per row and no second "Export now"', () => {
    render(<Reports />);
    expect(screen.queryByRole('button', { name: 'Export now' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Export' })).toHaveLength(reports().length);
  });

  it('says why a report cannot export instead of showing a dead button', () => {
    setChannels(CHANNEL_KEYS.filter((c) => c !== 'meta'));
    setActiveChannels(CHANNEL_KEYS.filter((c) => c !== 'meta'));
    const { container } = render(<Reports />);
    const row = [...container.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent!.includes('Meta deep dive')) as HTMLElement;
    expect(within(row).queryByRole('button', { name: 'Export' })).toBeNull();
    expect(row.textContent).toMatch(/Meta switched off/);
  });

  it('New report works: name, channels, cadence, people -> a new row that exports', () => {
    const { container } = render(<Reports />);
    fireEvent.click(screen.getByRole('button', { name: 'New report' }));
    const form = screen.getByRole('form', { name: 'New report' });
    const create = within(form).getByRole('button', { name: 'Create report' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(form.textContent).toMatch(/Give it a name/);

    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Paid social Monday' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Meta' }));
    fireEvent.click(within(form).getByRole('button', { name: 'TikTok' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Weekly' }));
    expect(form.textContent).toMatch(/Pick at least one person/);
    fireEvent.click(within(form).getByRole('button', { name: 'Jess Ramírez' }));
    fireEvent.click(create);

    const mine = reports().find((r) => r.name === 'Paid social Monday')!;
    expect(mine.channels).toEqual(['meta', 'tiktok']);
    expect(mine.recipients).toEqual(['jr']);
    const row = [...container.querySelectorAll('tbody tr')][0] as HTMLElement;
    expect(row.textContent).toContain('Meta · TikTok');
    expect(row.textContent).toContain('Never run');
    expect(within(row).getByRole('button', { name: 'Export' })).toBeTruthy();
    fireEvent.click(within(row).getByRole('button', { name: 'Preview Paid social Monday' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Paid social Monday' }));
    expect(reports().some((r) => r.name === 'Paid social Monday')).toBe(false);
  });

  it('the five seeded reports cannot be removed', () => {
    render(<Reports />);
    for (const b of screen.getAllByRole('button', { name: /^Preview/ })) fireEvent.click(b);
    expect(screen.queryAllByRole('button', { name: /^Remove/ })).toHaveLength(0);
  });

  it('Preview shows the same total the CSV writes, over the report\'s own window', () => {
    render(<Reports />);
    const r = reports().find((x) => x.name === 'Creator channel blended')!;
    fireEvent.click(screen.getByRole('button', { name: 'Preview Creator channel blended' }));
    const panel = document.getElementById(`report-preview-${r.id}`)!;
    const spend = totals('tiktok', 30).spend + totals('youtube', 30).spend;
    expect(panel.querySelector('.gr-report-preview__total')!.textContent)
      .toContain(formatMetric('Spend', spend));
    /* Both windows are named, so "vs prior" says prior to WHAT. */
    expect(panel.textContent).toMatch(/Jul 14 – Aug 12, compared with Jun 14 – Jul 13/);
  });

  it('Pause and Resume change the schedule, not just the pill', () => {
    const { container } = render(<Reports />);
    const row = () => [...container.querySelectorAll('tbody tr')]
      .find((tr) => tr.textContent!.includes('Meta deep dive')) as HTMLElement;
    expect(row().textContent).toContain('Fri, Aug 14');
    fireEvent.click(screen.getByRole('button', { name: 'Preview Meta deep dive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(row().textContent).not.toContain('Aug 14');
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(row().textContent).toContain('Fri, Aug 14');
  });
});

describe('next run is measured from the last day of data (Wed Aug 12)', () => {
  const by = (n: string) => reports().find((r) => r.name === n)!;
  it('weekly lands on its weekday, strictly after today', () => {
    expect(formatRun(nextRun(by('Weekly performance summary'))!)).toBe('Mon, Aug 17');
    expect(formatRun(nextRun(by('Meta deep dive'))!)).toBe('Fri, Aug 14');
  });
  it('monthly is the 1st of next month; a paused or draft report has none', () => {
    expect(formatRun(nextRun(by('Creator channel blended'))!)).toBe('Tue, Sep 1');
    expect(nextRun(by('CAC watch'))).toBeUndefined();
    expect(nextRun(by('Q3 board pack'))).toBeUndefined();
  });
  it('scheduling the draft gives it a next run at the next quarter', () => {
    setReportStage('r5', 'Active');
    expect(formatRun(nextRun(by('Q3 board pack'))!)).toBe('Thu, Oct 1');
  });
});
