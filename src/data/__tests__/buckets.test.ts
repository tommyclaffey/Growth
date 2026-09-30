import { describe, expect, it } from 'vitest';
import { bucketsOf } from '../buckets';

const days = (start: string, n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10);
});

describe('weeks and months across a window', () => {
  it('weeks count back from the last day -- only the oldest can be short', () => {
    const b = bucketsOf(days('2026-07-14', 30), 'week');
    expect(b.map((x) => x.days)).toEqual([2, 7, 7, 7, 7]);
    expect(b.map((x) => x.full)).toEqual([false, true, true, true, true]);
    expect(b.at(-1)!.label).toBe('Aug 6–12');
    expect(b[1].label).toBe('Jul 16–22');
  });

  it('a week across two months names both', () => {
    expect(bucketsOf(days('2026-06-28', 7), 'week')[0].label).toBe('Jun 28 – Jul 4');
  });

  it('months are calendar months; whole ones are marked whole', () => {
    const b = bucketsOf(days('2026-06-01', 61), 'month');   // Jun 1 - Jul 31
    expect(b.map((x) => [x.label, x.days, x.full])).toEqual([['Jun 2026', 30, true], ['Jul 2026', 31, true]]);
  });

  it('every day lands in exactly one bucket', () => {
    const iso = days('2025-11-03', 200);
    for (const by of ['week', 'month'] as const) {
      const b = bucketsOf(iso, by);
      expect(b[0].start).toBe(0);
      expect(b.at(-1)!.end).toBe(200);
      for (let i = 1; i < b.length; i++) expect(b[i].start).toBe(b[i - 1].end);
    }
  });
});

describe('labels', () => {
  it('🐛 a 1-day week reads "Aug 13", not "Aug 13–13"', () => {
    const b = bucketsOf(days('2026-08-13', 8), 'week');
    expect(b[0].label).toBe('Aug 13');
  });
});
