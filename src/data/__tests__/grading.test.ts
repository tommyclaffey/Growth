// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { baselineFor, grade, tally, type Baseline } from '../grading';
import { decisions } from '../decisions';
import { ALL_CHANNELS } from '../blended';
import { CAMPAIGNS } from '../campaigns';
import { setStage } from '../campaignStatus';

afterEach(() => {
  setStage('c8', CAMPAIGNS.find((c) => c.id === 'c8')!.stage);
  localStorage.clear();
});

const all = () => decisions(30, ALL_CHANNELS);
const b = (over: Partial<Baseline>): Baseline => ({
  key: 'campaign-cac:c1', label: 'Campaign CAC', value: 40, better: 'lower', range: 30, checkOn: '2026-10-06', ...over,
});

describe('a baseline is captured for decisions a number can grade', () => {
  it('every decision that ends in an action is graded on the number it should move', () => {
    const byKind = (k: string) => all().find((c) => c.kind === k);
    expect(baselineFor(byKind('pacing')!, 30)?.key).toBe('pace:account');
    expect(baselineFor(byKind('stale-review')!, 30)?.better).toBe('state');
    /* Sept 30: these were investigations, graded by a person. Now they are
       actions, and each names its number. */
    expect(baselineFor(byKind('beats-its-channel')!, 30)?.key).toMatch(/^campaign-leads:/);
    expect(baselineFor(byKind('paused-winner')!, 30)?.key).toMatch(/^ad-leads:/);
    const pause = all().find((c) => c.id === 'weekly:cac:meta')!;
    expect(baselineFor(pause, 30)).toMatchObject({ label: 'Campaign CAC', better: 'lower' });
  });

  it('the baseline IS the current value, and the check date is the decision’s own', () => {
    const p = all().find((c) => c.kind === 'pacing')!;
    const base = baselineFor(p, 30)!;
    expect(base.checkOn).toBe(p.expectation!.checkOn);
    expect(base.value).toBeGreaterThan(0);
  });
});

describe('grading is honest', () => {
  it('before the check date it is pending, with the days left', () => {
    const g = grade({ baseline: b({}) }, new Date(2026, 8, 29));
    expect(g.status).toBe('pending');
    expect(g.text).toMatch(/Check in 7 days/);
  });

  it('⭐ after the date, an unmoved number is "no new data" -- never "missed"', () => {
    const real = decisions(30, ALL_CHANNELS).find((c) => c.kind === 'pacing')!;
    const base = { ...baselineFor(real, 30)!, checkOn: '2026-01-01' };
    const g = grade({ baseline: base }, new Date(2026, 8, 29));
    expect(g.status).toBe('no-data');
    expect(g.text).toMatch(/no new data since you decided/);
  });

  it('a number that moved the right way is met; the wrong way, missed', () => {
    /* Baseline invented to sit either side of the live campaign CAC. */
    const live = grade({ baseline: b({ checkOn: '2026-01-01', value: 1 }) }).now!;
    expect(grade({ baseline: b({ checkOn: '2026-01-01', value: live * 1.2 }) }).status).toBe('met');
    expect(grade({ baseline: b({ checkOn: '2026-01-01', value: live * 0.8 }) }).status).toBe('missed');
  });

  it('a state decision grades the moment it happens, no date needed', () => {
    const base = b({ key: 'stage-leaves:c8:Review', label: 'Out of Review', better: 'state', value: 0 });
    expect(grade({ baseline: base }).status).toBe('waiting');
    setStage('c8', 'Active');
    expect(grade({ baseline: base }).status).toBe('done');
  });

  it('what no number can grade, the person grades -- and can change their mind', () => {
    expect(grade({}).status).toBe('ungraded');
    expect(grade({ outcome: 'worked' }).status).toBe('worked');
    expect(grade({ outcome: 'didnt' }).status).toBe('didnt');
  });

  it('the track record counts worked, didn’t, and open', () => {
    expect(tally([
      { status: 'met', text: '' }, { status: 'done', text: '' }, { status: 'worked', text: '' },
      { status: 'missed', text: '' }, { status: 'pending', text: '' }, { status: 'no-data', text: '' },
    ])).toEqual({ good: 3, bad: 1, open: 2 });
  });
});
