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
  it('⭐ Meta’s 42% CAC jump is the FIRST thing to act on', () => {
    const top = decisions(30, ALL_CHANNELS)[0];
    expect(top.action).toBe('Find out why Meta CAC rose 42% this week');
    expect(top.tier).toBe(1);
  });

  it('every "this week" notification has a matching decision -- the two cannot disagree', () => {
    const ids = new Set(decisions(30, ALL_CHANNELS).map((c) => c.id));
    for (const n of notifications([...CHANNEL_KEYS]).filter((x) => x.group === 'This week')) {
      expect(ids.has(`weekly:${n.id}`), n.id).toBe(true);
    }
  });

  it('a good move asks what WORKED, so it can be repeated', () => {
    const aff = decisions(30, ALL_CHANNELS).find((c) => c.id === 'weekly:leads:affiliates')!;
    expect(aff.action).toMatch(/what drove Affiliates' 31% jump in leads — and repeat it/);
  });

  it('it asks why -- it never tells you to cut the channel that spiked', () => {
    const meta = decisions(30, ALL_CHANNELS).find((c) => c.id === 'weekly:cac:meta')!;
    expect(meta.action).not.toMatch(/cut|pause|stop/i);
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
