// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ask } from '../assistant';
import { decisions } from '../decisions';
import { grade, measure } from '../grading';
import { parseAmount } from '../scenario';
import { campaignTotals } from '../campaignSeries';
import { CAMPAIGNS } from '../campaigns';
import { ALL_CHANNELS } from '../blended';
import { addFlag, flags, removeFlag } from '../attention';

/*
 * Regressions from the Sept 29 thought-partner audit. Each pins one bug the
 * audit reproduced; each failed before its fix.
 */
afterEach(() => {
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
});

describe('amounts', () => {
  it.each([
    ['$5k', 5000], ['5,000', 5000], ['1.5k', 1500], ['move 5k from meta to tiktok', 5000],
    ['move 5,000 from Meta to TikTok', 5000], ['what if I move 5000 dollars', 5000],
    ['$500 kept in reserve', 500], ['$1.5 million', 1_500_000], ['$0', 0],
  ])('%s → %d', (q, v) => expect(parseAmount(q)).toBe(v));

  it.each([
    'over the last 30 days', 'CAC up 25%', 'what happened in 2026', 'ROAS of 3x', 'my 12 campaigns',
  ])('not money: %s', (q) => expect(parseAmount(q)).toBeUndefined());

  it('🐛 "move 5,000" moves 5,000 -- not the silent $8,000 default', () => {
    expect(ask('What if I move 5,000 from Meta to TikTok?', 30).text).toMatch(/Moving \$5,000/);
  });

  it('a stated $0 is answered, not replaced by the default', () => {
    expect(ask('What if I move $0 from Meta to TikTok?', 30).text).toMatch(/\$0 changes nothing/);
  });
});

describe('scoping', () => {
  it('🐛 "What should I do about Meta?" is about Meta -- the brief offers exactly this question', () => {
    const a = ask('What should I do about Meta?', 30);
    expect(a.text).toMatch(/on Meta/);
    expect(a.text).not.toMatch(/on this account/);
  });

  it('🐛 "What would you do?" with no subject sees the whole agenda, not only pacing', () => {
    const a = ask('What would you do?', 30);
    expect(a.decisions!.length).toBeGreaterThan(1);
  });

  it('🐛 a campaign’s status answer shows the CAMPAIGN’s figures, not the account’s', () => {
    const c = CAMPAIGNS.find((x) => x.name === 'App Walkthrough Series')!;
    const a = ask(`What's going on with ${c.name}?`, 30, { kind: 'campaign', id: c.id, label: c.name });
    const t = campaignTotals(c.id, 30);
    expect(a.text).toContain(`$${Math.round(t.spend).toLocaleString()}`);
    expect(a.text).not.toContain('$160,780');
  });

  it('🐛 the status count matches what it lists, and taken decisions leave it', () => {
    const q = 'How is Paid Search doing?';
    const before = ask(q, 30).text;
    const n = Number(before.match(/(\d+) things I can act on/)?.[1] ?? (/One thing/.test(before) ? 1 : 0));
    const listed = before.split('\n\n').filter((l) => /—/.test(l) && !/over the/.test(l)).length;
    if (!/the \d+ strongest/.test(before)) expect(listed).toBeGreaterThanOrEqual(Math.min(n, 3));
    for (const c of decisions(30, ALL_CHANNELS).filter((x) => x.channel === 'paidSearch' && x.tier !== 3)) {
      addFlag('decision', c.id, c.action);
    }
    expect(ask(q, 30).text).toMatch(/Nothing here that this data supports acting on/);
  });

  it('🐛 "Which channel has the worst ROAS?" ranks channels -- it is not a pause question', () => {
    const a = ask('Which channel has the worst ROAS?', 30);
    expect(a.text).not.toMatch(/At the ad level/);
    expect(a.text).toMatch(/ROAS/);
  });
});

describe('grading a subject that no longer exists', () => {
  it('🐛 a missing ad or campaign is "how did it go?" -- never "missed, 40 → 0" or "done"', () => {
    expect(measure('ad-leads:nope', 30)).toBeUndefined();
    expect(measure('stage-leaves:nope:Review', 30)).toBeUndefined();
    expect(measure('campaign-cac:nope', 30)).toBeUndefined();
    const g = grade({ baseline: { key: 'ad-leads:nope', label: 'Leads on this ad', value: 40, better: 'higher', range: 30, checkOn: '2026-01-01' } });
    expect(g.status).toBe('ungraded');
  });
});

describe('English', () => {
  it('🐛 no "Signups’s" -- possessives of names ending in s', () => {
    const all = decisions(30, ALL_CHANNELS).flatMap((c) => [c.action, c.because]).join(' ');
    expect(all).not.toMatch(/s’s\b/);
  });
});

describe('budget moves to a channel the account does not have', () => {
  it('says the channel is not in the account -- not "could not turn that into a question"', async () => {
    const { setChannels } = await import('../channels');
    const { CHANNEL_KEYS } = await import('../metrics');
    setChannels(['meta', 'tiktok']);
    const a = ask('What if I move $5k from Meta to Paid Search?', 30);
    expect(a.answered).toBe(true);
    expect(a.text).toMatch(/Paid Search is not part of this account/);
    setChannels([...CHANNEL_KEYS]);
  });
});
