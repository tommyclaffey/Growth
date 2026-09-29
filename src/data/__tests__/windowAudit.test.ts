// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { buildCsv } from '../exportCsv';
import { grade, measure } from '../grading';
import { snapshot, reports } from '../reports';
import { CAMPAIGNS } from '../campaigns';
import { DAY_ISO, setWindowEnd, totals } from '../metrics';

/*
 * Regressions from the Sept 29 audit of the custom-window work. Each failed
 * against the code before its fix.
 */
afterEach(() => setWindowEnd(0));
const endAt = (iso: string) => setWindowEnd(DAY_ISO.length - 1 - DAY_ISO.indexOf(iso));

describe('custom windows', () => {
  it('🐛 the CSV labels each row with ITS day, not a day 12 later', () => {
    endAt('2026-07-31');
    const first = buildCsv('meta', 31).split('\n')[1];
    expect(first.startsWith('Jul 1,')).toBe(true);
  });

  it('🐛 a grade is measured on the latest data -- moving the picker does not change it', () => {
    const c = CAMPAIGNS[0];
    const now = measure(`campaign-cac:${c.id}`, 30);
    endAt('2025-09-01');
    expect(measure(`campaign-cac:${c.id}`, 30)).toBe(now);
    const g = grade({ baseline: { key: `campaign-cac:${c.id}`, label: 'Campaign CAC', value: now!, better: 'lower', range: 30, checkOn: '2026-01-01' } });
    expect(g.status).toBe('no-data');
  });

  it('🐛 a scheduled report covers the latest days, whatever the picker shows', () => {
    const r = reports()[0];
    const latest = snapshot(r, ['meta']);
    endAt('2026-07-31');
    expect(snapshot(r, ['meta'])).toEqual(latest);
    expect(totals('meta', 30).spend).not.toBe(0);    // the picker's window is untouched after
  });
});
