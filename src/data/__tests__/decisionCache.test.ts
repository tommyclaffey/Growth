// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { clearDecisionCache, decisions } from '../decisions';
import { ALL_CHANNELS } from '../blended';
import { setWindowEnd } from '../metrics';
import { setStage, stageOf } from '../campaignStatus';
import { setChannelBudget, setMonthlyBudget, monthlyBudget } from '../profile';
import { setPref, prefs } from '../prefs';
import { CAMPAIGNS } from '../campaigns';

/**
 * ⚠️ A cache with a missing input shows yesterday's decisions with today's
 * numbers. Each test changes ONE input and asserts the engine's answer moves
 * with it -- the same as an uncached run.
 */
const ids = () => decisions(30, ALL_CHANNELS).map((c) => `${c.id}:${c.action}`).join('\n');
const fresh = () => { clearDecisionCache(); return ids(); };

afterEach(() => { setWindowEnd(0); localStorage.clear(); clearDecisionCache(); });

describe('the decision cache never serves a stale answer', () => {
  it('returns the same thing twice, as a copy the caller cannot corrupt', () => {
    const a = decisions(30, ALL_CHANNELS);
    a.length = 0;
    expect(decisions(30, ALL_CHANNELS).length).toBeGreaterThan(0);
  });

  it('range and channels', () => {
    const a = ids();
    expect(decisions(7, ALL_CHANNELS).map((c) => c.id).join()).toBe((clearDecisionCache(), decisions(7, ALL_CHANNELS)).map((c) => c.id).join());
    expect(decisions(30, ['meta']).every((c) => c.channel === undefined || c.channel === 'meta')).toBe(true);
    expect(ids()).toBe(a);
  });

  it('the date window', () => {
    const before = ids();
    setWindowEnd(40);
    const after = ids();
    expect(after).not.toBe(before);            // the input really matters...
    expect(after).toBe(fresh());               // ...and the cache followed it
  });

  it('a campaign stage', () => {
    const before = ids();
    const c = CAMPAIGNS.find((x) => stageOf(x.id) === 'Active')!;
    setStage(c.id, 'Paused');
    try { const after = ids(); expect(after).not.toBe(before); expect(after).toBe(fresh()); } finally { setStage(c.id, 'Active'); }
  });

  it('the monthly budget and channel budgets', () => {
    const was = ids();
    const before = monthlyBudget();
    setMonthlyBudget(before * 3);
    const after = ids();
    expect(after).not.toBe(was);
    expect(after).toBe(fresh());
    setChannelBudget('meta', 1000);
    expect(ids()).toBe(fresh());
    setChannelBudget('meta', null);
    setMonthlyBudget(before);
  });

  it('the news threshold', () => {
    const was = ids();
    const before = prefs().changeThreshold;
    setPref('changeThreshold', 60);
    try { const after = ids(); expect(after).not.toBe(was); expect(after).toBe(fresh()); } finally { setPref('changeThreshold', before); }
  });
});
