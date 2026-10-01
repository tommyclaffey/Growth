// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyStructure } from '../structure';
import { decisions } from '../decisions';
import { setStage } from '../campaignStatus';
import { CAMPAIGNS } from '../campaigns';
import { ALL_CHANNELS } from '../blended';
import { hydrate, TOTAL_POINTS, type DayRow } from '../metrics';
import { seededSource } from '../sources/seeded';
import type { SourceCampaign } from '../source';

/*
 * ⭐ Sept 30 -- EVERY DECISION ENDS IN AN ACTION.
 *
 * Tommy: "'Find out why…' is saying 'hey, you go figure it out.' Based on the
 * machine's decision-making, what do you think they should do? That's what
 * makes this product worth it."
 *
 * The data still cannot say WHY a number moved. It can say WHERE, and what a
 * careful buyer does while the cause is unknown. These pin each branch.
 */
afterEach(() => {
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
  applyStructure(undefined);
  localStorage.clear();
});

/* Flat history, then a different last week. */
const series = (spend: number, leads: number, lastSpend: number, lastLeads: number): DayRow[] =>
  Array.from({ length: TOTAL_POINTS }, (_, i) => {
    const last = i >= TOTAL_POINTS - 7;
    const s = last ? lastSpend : spend;
    const l = last ? lastLeads : leads;
    return { spend: s, impressions: s * 80, clicks: l * 20, leads: l, sales: l / 10, revenue: s * 3 };
  });

function load(a: DayRow[], b: DayRow[]) {
  const camps: SourceCampaign[] = [
    { id: 'm1', name: 'Spring Leads — Broad', channel: 'meta', stage: 'Active', objective: 'Conversions', rows: a },
    { id: 'm2', name: 'Retargeting', channel: 'meta', stage: 'Active', objective: 'Sales', rows: b },
  ];
  const sum = a.map((r, i) => ({
    spend: r.spend + b[i].spend, impressions: r.impressions + b[i].impressions, clicks: r.clicks + b[i].clicks,
    leads: r.leads + b[i].leads, sales: r.sales + b[i].sales, revenue: r.revenue + b[i].revenue,
  }));
  hydrate({ rows: { meta: sum }, periodEnd: '2026-09-28', currency: 'USD' });
  applyStructure(camps);
}

describe('a weekly move becomes something to DO', () => {
  it('cost rose everywhere at once → cut 20% until it is back under last week', () => {
    load(series(100, 4, 100, 2), series(100, 4, 100, 2));   // both: $25 → $50 a lead
    const d = decisions(30, ['meta']).find((c) => c.id === 'weekly:cac:meta')!;
    expect(d.action).toBe('Cut Meta’s budget 20% until CAC is back under $25.00');
    expect(d.tier).toBe(1);
    expect(d.expectation?.outcome).toMatch(/Saves about \$280 a week/);
    expect(d.measure).toMatchObject({ key: 'channel-cac:meta', better: 'lower' });
  });

  it('leads fell because SPEND fell, at the same price → put the spend back', () => {
    load(series(100, 4, 50, 2), series(100, 4, 50, 2));     // half the spend, half the leads
    const d = decisions(30, ['meta']).find((c) => c.id === 'weekly:leads:meta')!;
    expect(d.action).toBe('Put Meta’s budget back to $1,400 a week');
    expect(d.tier).toBe(2);
    expect(d.expectation?.assuming).toMatch(/last week’s \$25\.00/);
    expect(d.expectation?.outcome).toMatch(/About 28 leads a week back/);
  });

  it('leads rose → raise the campaign that led it, once -- not once per detector', () => {
    load(series(100, 4, 100, 8), series(100, 4, 100, 4));   // m1 doubles its leads
    const raises = decisions(30, ['meta']).filter((c) => /^Raise /.test(c.action));
    expect(raises.map((c) => c.action)).toEqual(['Raise the budget on “Spring Leads — Broad” 20% (+$140 a week)']);
    expect(raises[0].tier).toBe(2);
    expect(raises[0].expectation?.assuming).toMatch(/put the budget back/);
  });
});

describe('a campaign in Review gets a verdict, not "decide on it"', () => {
  it('approve when it costs what the channel costs', () => {
    const c = CAMPAIGNS.find((x) => x.id === 'c1')!;
    setStage('c1', 'Review');
    const d = decisions(30, ALL_CHANNELS).find((x) => x.id === 'review:c1')!;
    expect(d.action).toMatch(/^Approve “Advantage\+ — Evergreen Signups” — it pays \$[\d.]+ a lead$/);
    setStage('c1', c.stage);
  });

  it('end when it costs clearly more -- and drop the cards inside it', () => {
    const all = decisions(30, ALL_CHANNELS);
    const end = all.find((x) => x.id === 'review:c8')!;
    expect(end.action).toMatch(/^End “Non-brand — High Intent”/);
    /* A pause on an ad inside a campaign you are ending is the same money twice. */
    expect(all.some((x) => x.scope.includes('Non-brand — High Intent') && x.id !== 'review:c8')).toBe(false);
  });
});

it('🚨 no proposal in the queue is homework -- every one starts with what to do', () => {
  for (const c of decisions(30, ALL_CHANNELS).filter((x) => x.tier !== 3)) {
    expect(c.action, c.action).not.toMatch(/^(Find out|Review|Investigate|Look into|Check|Decide on)\b/);
  }
});

it('one action, one card -- no two proposals do the same thing to the same target', () => {
  const keys = decisions(30, ALL_CHANNELS).map((c) => `${c.action.split(' ')[0]}|${c.target.kind}|${c.target.id}`);
  expect(new Set(keys).size).toBe(keys.length);
});

describe('the podcast question gets a decision beside it, not instead of it', () => {
  it('the question stays a question; the TEST is the thing you can take', () => {
    const all = decisions(30, ALL_CHANNELS);
    const q = all.find((c) => c.kind === 'cross-channel-cost-gap')!;
    const t = all.find((c) => c.kind === 'holdout-test')!;
    expect(q.tier).toBe(3);
    expect(q.action.endsWith('?')).toBe(true);
    expect(t.tier).toBe(1);
    expect(t.action).toBe('Test Podcasts before touching its budget: a 2-week regional holdout');
    /* It never tells you to cut the channel -- it tells you how to find out. */
    expect(t.action).not.toMatch(/\b(cut|reduce|kill|drop)\b/i);
    expect(t.expectation?.outcome).toMatch(/keep it/);
  });
});
