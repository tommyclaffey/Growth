// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ask } from '../assistant';
import { brief } from '../brief';
import { decisions } from '../decisions';
import { notifications } from '../notifications';
import { moveBudget, parseAmount, whereToScale } from '../scenario';
import { ALL_CHANNELS } from '../blended';
import { CHANNEL_KEYS, totals } from '../metrics';
import { flags, removeFlag } from '../attention';

afterEach(() => {
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
});

describe('the engine knows what moved this week', () => {
  it('⭐ Meta’s 42% CAC jump is the FIRST thing to act on -- as an ACTION', () => {
    const top = decisions(30, ALL_CHANNELS)[0];
    /* Sept 30: it was "Find out why Meta CAC rose 42%". The engine now finds
       WHERE (the live ad paying the most per lead) and says what to do. */
    expect(top.id).toBe('weekly:cac:meta');
    expect(top.action).toBe('Pause “Join 400,000 people” (Broad — US 25-54)');
    expect(top.because).toMatch(/from \$33\.85 to \$48\.04/);
    expect(top.tier).toBe(1);
  });

  it('every "this week" notification has a matching decision -- the two cannot disagree', () => {
    const ids = new Set(decisions(30, ALL_CHANNELS).map((c) => c.id));
    for (const n of notifications([...CHANNEL_KEYS]).filter((x) => x.group === 'This week')) {
      expect(ids.has(`weekly:${n.id}`), n.id).toBe(true);
    }
  });

  it('a good move gives more to what led it -- with the line at which to pull back', () => {
    const aff = decisions(30, ALL_CHANNELS).find((c) => c.id === 'weekly:leads:affiliates')!;
    expect(aff.action).toBe('Raise the budget on “Partner Network — Tier 1” 20% (+$887 a week)');
    expect(aff.tier).toBe(2);
    expect(aff.expectation?.assuming).toMatch(/If a week comes in above \$38\.89, put the budget back/);
  });

  it('a cost spike acts on the ad that stands out -- never the whole channel on cost alone', () => {
    const meta = decisions(30, ALL_CHANNELS).find((c) => c.id === 'weekly:cac:meta')!;
    expect(meta.target.kind).toBe('ad');
    expect(meta.action).not.toMatch(/Meta’s budget/);
  });
});

describe('the brief -- the partner speaks first', () => {
  it('leads with the biggest move, then what is waiting', () => {
    const b = brief(30, [...CHANNEL_KEYS]);
    expect(b.lines[0].text).toMatch(/^Meta CAC rose 42%/);
    expect(b.lines[0].tone).toBe('bad');
    expect(b.lines.some((l) => /decisions? ready to act on/.test(l.text))).toBe(true);
    expect(b.heading).toMatch(/^Week of Aug 6 – Aug 12/);
  });

  it('every question it offers gets a real answer', () => {
    for (const q of brief(30, [...CHANNEL_KEYS]).asks) {
      const a = ask(q, 30);
      expect(a.answered, q).toBe(true);
      expect(a.text.length, q).toBeGreaterThan(20);
    }
  });
});

describe('what if -- scaling questions, with the assumption said', () => {
  it('parses amounts people actually type', () => {
    expect(parseAmount('move $5k from x')).toBe(5000);
    expect(parseAmount('add $12,500')).toBe(12500);
    expect(parseAmount('what if i spend 3000 dollars')).toBe(3000);
    expect(parseAmount('no money here')).toBeUndefined();
  });

  it('⭐ "where should more budget go" never recommends the channel whose CAC just spiked', () => {
    const s = whereToScale(10000, 30);
    const meta = s.options.find((o) => o.channel === 'meta')!;
    expect(meta.hold).toMatch(/rose 42% this week/);
    expect(s.options[0].hold).toBeUndefined();
    const a = ask('Where should more budget go?', 30);
    expect(a.text).toMatch(/Not Meta yet/);
    expect(a.text).toMatch(/Assuming each channel keeps its current cost per lead/);
    expect(a.text).toMatch(/last click/);
  });

  it('a move is exact arithmetic at current rates', () => {
    const m = moveBudget(5000, 'podcasts', 'tiktok', 30);
    expect(m.lost).toBeCloseTo(5000 / totals('podcasts', 30).cac, 6);
    expect(m.gained).toBeCloseTo(5000 / totals('tiktok', 30).cac, 6);
    const a = ask('What if I move $5k from Podcasts to TikTok?', 30);
    expect(a.text).toMatch(/^Moving \$5,000 from Podcasts to TikTok/);
    /* The cross-channel caveat is not optional on a cross-channel move. */
    expect(a.text).toMatch(/last click/);
  });

  it('a move INTO a spiking channel is flagged', () => {
    expect(ask('Shift $2,000 from TikTok to Meta', 30).text).toMatch(/Careful: Meta/);
  });

  it('scaling one channel names its best campaign, and a jump to understand first', () => {
    const a = ask("How do I get more of what's working on Affiliates?", 30);
    expect(a.text).toMatch(/Partner Network — Tier 1/);
    expect(a.text).toMatch(/jumped 31% this week/);
  });

  it('it never nudges toward cutting the expensive channel', () => {
    const a = ask('Where should more budget go?', 30);
    expect((a.followUps ?? []).join(' ')).not.toMatch(/from Podcasts/);
  });
});

describe('the team sets what counts as a big move -- and every surface obeys it', () => {
  it('one threshold drives the feed, the engine, the brief and the scaling hold', async () => {
    const { setPref } = await import('../prefs');
    const { notifications: notes } = await import('../notifications');
    setPref('changeThreshold', 50);
    try {
      expect(notes([...CHANNEL_KEYS]).filter((n) => n.group === 'This week')).toHaveLength(0);
      expect(decisions(30, ALL_CHANNELS).some((c) => c.kind === 'weekly-move')).toBe(false);
      expect(brief(30, [...CHANNEL_KEYS]).lines[0].text).toMatch(/Nothing moved 50% or more/);
      expect(whereToScale(1000, 30).options.find((o) => o.channel === 'meta')!.hold).toBeUndefined();
      setPref('changeThreshold', 25);
      expect(decisions(30, ALL_CHANNELS).filter((c) => c.kind === 'weekly-move')).toHaveLength(2);
    } finally {
      setPref('changeThreshold', 15);
    }
  });
});

describe('compare two campaigns', () => {
  it('only efficiency gets a winner; a missing metric is a dash, not 0', async () => {
    const { compareCampaigns } = await import('../compare');
    const c = compareCampaigns('c1', 'c9', 30)!;            // Meta vs Podcasts
    expect(c.crossChannel).toBe(true);
    expect(c.rows.find((r) => r.metric === 'Spend')!.winner).toBeUndefined();
    expect(c.rows.find((r) => r.metric === 'CAC')!.winner).toBe('a');
    expect(c.rows.find((r) => r.metric === 'CTR')!.b).toBeUndefined();   // podcasts: no clicks
  });

  it('Ask answers "compare A with B", with the cross-channel caveat when it applies', () => {
    const a = ask('Compare Advantage+ — Evergreen Signups with Mid-roll Sponsorships', 30);
    expect(a.answered).toBe(true);
    expect(a.text).toMatch(/cheaper per lead/);
    expect(a.text).toMatch(/cost comparison, not attribution/);
    const same = ask('Compare Advantage+ — Evergreen Signups with Tax Season — Prospecting', 30);
    expect(same.text).toMatch(/Same channel, so they are measured the same way/);
  });
});

describe('compare ties', () => {
  it('values equal as displayed are a tie -- no winner from an invisible decimal', async () => {
    const { compareCampaigns } = await import('../compare');
    const c = compareCampaigns('c1', 'c2', 30)!;
    for (const r of c.rows) if (r.a !== undefined && r.a === r.b) expect(r.winner, r.metric).toBeUndefined();
  });
});

describe('the partner remembers what the team decided', () => {
  const setup = async () => {
    const { addFlag, setTask, setOutcome, ownDecisionId } = await import('../attention');
    const meta = decisions(30, ALL_CHANNELS).find((c) => c.id === 'weekly:cac:meta')!;
    addFlag('decision', meta.id, meta.action, { target: meta.target });
    setTask('decision', meta.id, meta.action, { owner: 'jr', due: '2020-01-01' });
    const own = ownDecisionId('Pause podcasts for a week');
    addFlag('decision', own, 'Pause podcasts for a week');
    setOutcome('decision', own, 'worked');
    return meta;
  };

  it('"what have we decided?" lists the queue, newest first, with owners and dates', async () => {
    const meta = await setup();
    const a = ask('What have we decided?', 30);
    expect(a.text).toMatch(/^2 decisions, newest first:/);
    expect(a.text).toContain(`${meta.action} — Jess, overdue since`);
  });

  it('"how are my decisions going?" gives the track record from the grades', async () => {
    await setup();
    const a = ask('How are my decisions going?', 30);
    expect(a.text).toMatch(/^1 worked, 0 didn't, 1 still open\./);
    expect(a.text).toMatch(/Pause podcasts for a week: You marked this as having worked/);
  });

  it('"what\'s overdue?" and "what does Jess own?"', async () => {
    const meta = await setup();
    expect(ask("What's overdue?", 30).text).toMatch(/1 decision is overdue/);
    expect(ask('What does Jess own?', 30).text).toContain(meta.action);
    expect(ask('What does Dan own?', 30).text).toMatch(/doesn't own any decisions yet/);
  });

  it('with nothing decided, it says so and points forward', () => {
    expect(ask('What did we decide?', 30).text).toMatch(/^Nothing is decided yet/);
  });

  it('the brief offers these questions when they apply', async () => {
    await setup();
    const asks = brief(30, [...CHANNEL_KEYS]).asks;
    expect(asks).toContain("What's overdue?");
    for (const q of asks) expect(ask(q, 30).answered, q).toBe(true);
  });
});

describe('decision events in the feed', () => {
  it('overdue, worked and no-data events appear; a grade YOU gave does not', async () => {
    const { addFlag, setTask, setOutcome, ownDecisionId } = await import('../attention');
    const { decisionEvents } = await import('../decisionEvents');
    const { setStage } = await import('../campaignStatus');
    const { baselineFor } = await import('../grading');
    const all = decisions(30, ALL_CHANNELS);
    const review = all.find((c) => c.kind === 'stale-review')!;
    const pacing = all.find((c) => c.kind === 'pacing')!;
    addFlag('decision', review.id, review.action, { target: review.target, baseline: baselineFor(review, 30) });
    addFlag('decision', pacing.id, pacing.action, { baseline: { ...baselineFor(pacing, 30)!, checkOn: '2020-01-01' } });
    setTask('decision', pacing.id, pacing.action, { due: '2020-01-01' });
    const own = ownDecisionId('Try a new hook');
    addFlag('decision', own, 'Try a new hook');
    setOutcome('decision', own, 'worked');
    setStage(review.target.id, 'Active');
    try {
      const ids = decisionEvents().map((e) => e.id);
      expect(ids).toContain(`dec:worked:${review.id}`);
      expect(ids).toContain(`dec:overdue:${pacing.id}`);
      expect(ids).toContain(`dec:nodata:${pacing.id}`);
      expect(ids.some((i) => i.includes(own))).toBe(false);
    } finally {
      setStage(review.target.id, 'Review');
    }
  });
});

describe('per-channel budgets', () => {
  it('a channel off its own budget is a Standing alert; one without a budget has none', async () => {
    const { setChannelBudget } = await import('../profile');
    const { notifications: notes } = await import('../notifications');
    /* TikTok spent ~$6.4k in 7 days. A $40k/month budget is $9.3k/week -> ~31% under. */
    setChannelBudget('tiktok', 40000);
    try {
      const n = notes([...CHANNEL_KEYS]).find((x) => x.id === 'pacing:tiktok')!;
      expect(n.message).toMatch(/^TikTok is spending \d+% under its budget/);
      expect(notes([...CHANNEL_KEYS]).some((x) => x.id === 'pacing:youtube')).toBe(false);
    } finally {
      setChannelBudget('tiktok', null);
    }
  });

  it('"where should more budget go?" says how much of each budget is unspent', async () => {
    const { setChannelBudget } = await import('../profile');
    setChannelBudget('tiktok', 40000);
    try {
      expect(ask('Where should more budget go?', 30).text).toMatch(/TikTok — .* of its budget unspent/);
    } finally {
      setChannelBudget('tiktok', null);
    }
  });
});
