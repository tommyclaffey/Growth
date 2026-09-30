// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ask } from '../assistant';
import { trendBy } from '../trend';
import { delta, setWindowEnd, totals } from '../metrics';

afterEach(() => setWindowEnd(0));

describe('the trend, period by period -- one definition for the table, Ask and the model', () => {
  it('weeks: the latest week is the same week the alerts measure', () => {
    const t = trendBy('meta', 'CAC', 'week', 84);
    expect(t.points).toHaveLength(12);
    expect(t.points.at(-1)!.change).toBe(delta('meta', 'CAC', 7));      // the "Meta CAC ↑ 42%" alert
  });

  it('a ratio per period comes from the period’s summed funnel; the periods add up to the window', () => {
    const t = trendBy('all', 'Spend', 'week', 84);
    const total = t.points.reduce((a, p) => a + (p.value ?? 0), 0);
    expect(total).toBeCloseTo(totals('all', 84).spend, 6);
  });

  it('no change is stated against a partial period', () => {
    const t = trendBy('all', 'Leads', 'week', 30);           // 2-day oldest week
    expect(t.points[0].full).toBe(false);
    expect(t.points[1].change).toBeNull();
  });

  it('a span longer than the data is shortened, never padded with zeros', () => {
    setWindowEnd(700);
    const t = trendBy('all', 'Spend', 'week', 365);
    expect(t.days).toBeLessThan(365);
    expect(t.points.every((p) => p.value !== null && p.value > 0)).toBe(true);
  });
});

describe('Ask answers trend questions from the same numbers', () => {
  it('⭐ "how has Meta CAC trended over the last 12 weeks" lists the weeks and the latest move', () => {
    const a = ask('How has Meta CAC trended over the last 12 weeks?', 30);
    expect(a.text).toMatch(/Meta CAC by week, the last 12 weeks/);
    expect(a.text).toMatch(/Aug 6–12: \$48\.04/);
    expect(a.text).toMatch(/up 42% on the week before/);
    expect(a.text).toMatch(/Why it moved is not in this data/);
  });

  it('"by month" defaults to six months, not two partial ones', () => {
    const a = ask('Spend by month', 30);
    expect((a.text.match(/^• /gm) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it('a "why" question is not a trend question', () => {
    expect(ask('Why is Meta CAC up week over week?', 30).text).toMatch(/cannot tell you why/);
  });
});
