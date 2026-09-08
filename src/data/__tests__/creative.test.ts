import { describe, expect, it } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import { ADVERTISER, creativesFor, rankCreatives } from '../creative';

describe('creative', () => {
  it('gives paid search TEXT ads and no images — the same rule that denies it a CPM', () => {
    const ps = CAMPAIGNS.find((c) => c.channel === 'paidSearch')!;
    const kinds = new Set(creativesFor(ps.id).map((c) => c.kind));
    expect(kinds).toEqual(new Set(['text']));
  });

  it('gives podcasts AUDIO and no visual format at all', () => {
    const pod = CAMPAIGNS.find((c) => c.channel === 'podcasts')!;
    const cr = creativesFor(pod.id);
    expect(cr.every((c) => c.kind === 'audio')).toBe(true);
    expect(cr.every((c) => c.ratio === undefined)).toBe(true);
    expect(cr.every((c) => (c.seconds ?? 0) > 0)).toBe(true);
  });

  it('gives every visual asset a real ratio, and every timed asset a duration', () => {
    for (const c of CAMPAIGNS) {
      for (const cr of creativesFor(c.id)) {
        if (cr.kind === 'image' || cr.kind === 'video') expect(cr.ratio).toBeTruthy();
        if (cr.kind === 'video' || cr.kind === 'audio') expect(cr.seconds).toBeGreaterThan(0);
      }
    }
  });

  it('reconciles with the ad set above it — spend adds up, within rounding', () => {
    for (const c of CAMPAIGNS) {
      const all = creativesFor(c.id);
      for (const a of c.adSets) {
        const mine = all.filter((cr) => cr.adSetId === a.id);
        expect(mine.length).toBeGreaterThan(0);
        const sum = mine.reduce((x, cr) => x + cr.spend, 0);
        /* Rounded per creative, so allow a dollar per asset — but no more.
           A creative table that does not add up to the row above it is worse
           than no creative table. */
        expect(Math.abs(sum - a.spend)).toBeLessThanOrEqual(mine.length);
      }
    }
  });

  it('never reports an ad as running inside a paused ad set', () => {
    for (const c of CAMPAIGNS) {
      for (const cr of creativesFor(c.id)) {
        const owner = c.adSets.find((a) => a.id === cr.adSetId)!;
        if (owner.stage === 'Paused') expect(cr.stage).toBe('Paused');
      }
    }
  });

  it('is deterministic — the same campaign renders the same ads every time', () => {
    const a = creativesFor('c1');
    const b = creativesFor('c1');
    expect(a).toEqual(b);
  });

  it('returns nothing for a campaign that does not exist', () => {
    expect(creativesFor('nope')).toEqual([]);
  });
});

describe('the master asset', () => {
  it('is attached to every still, and to nothing else', () => {
    for (const c of CAMPAIGNS) {
      for (const cr of creativesFor(c.id)) {
        if (cr.kind === 'image') {
          expect(cr.src, `${cr.id} still`).toBeTruthy();
          expect(cr.focus, `${cr.id} crop anchor`).toBeTruthy();
        } else {
          /* Video, audio, text and link have no still. Inventing a thumbnail
             for a film nobody shot is the thing this file will not do. */
          expect(cr.src, `${cr.id} must not claim artwork`).toBeUndefined();
        }
      }
    }
  });

  it('anchors each ratio deliberately, rather than defaulting everything to centre', () => {
    const meta = CAMPAIGNS.find((c) => c.channel === 'meta')!;
    const stills = creativesFor(meta.id).filter((c) => c.kind === 'image');
    /* A tall poster cropped to a square and to 4:5 should not keep the same
       band — if these ever match, the crop decision has been lost. */
    const byRatio = new Map(stills.map((c) => [c.ratio, c.focus]));
    expect(byRatio.get('1:1')).not.toBe(byRatio.get('4:5'));
  });
});

describe('the advertiser is not the platform', () => {
  it('never points a destination at this product', () => {
    for (const c of CAMPAIGNS) {
      for (const cr of creativesFor(c.id)) {
        if (!cr.destination) continue;
        /* Growth is the reporting tool. A search ad inside a customer's
           account displaying growth.app would be showing the analytics
           vendor's URL to that customer's shoppers. */
        expect(cr.destination.toLowerCase()).not.toContain('growth');
        expect(cr.destination).toContain(ADVERTISER.domain);
      }
    }
  });

  it('never writes copy that advertises this product', () => {
    const banned = ['dashboard', 'reporting', 'ROAS', 'CAC', 'blended', 'trial', 'seats'];
    for (const c of CAMPAIGNS) {
      for (const cr of creativesFor(c.id)) {
        const text = `${cr.headline} ${cr.body}`.toLowerCase();
        for (const word of banned) {
          expect(text, `${cr.id}: "${text}"`).not.toContain(word.toLowerCase());
        }
      }
    }
  });
});

describe('ranking', () => {
  const mk = (id: string, spend: number, leads: number) =>
    ({ id, spend, leads } as unknown as Parameters<typeof rankCreatives>[0][number]);

  it('ranks CAC ASCENDING — cheapest first, not most expensive', () => {
    const out = rankCreatives([mk('a', 1000, 10), mk('b', 1000, 50)], 'CAC');
    /* b is $20/lead, a is $100/lead. Sorting CAC like every other metric would
       put the most expensive ad at #1 and call it top. */
    expect(out.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('ranks Leads and Spend descending', () => {
    expect(rankCreatives([mk('a', 10, 1), mk('b', 10, 9)], 'Leads').map((c) => c.id))
      .toEqual(['b', 'a']);
    expect(rankCreatives([mk('a', 99, 1), mk('b', 10, 1)], 'Spend').map((c) => c.id))
      .toEqual(['a', 'b']);
  });

  it('sorts a zero-lead ad LAST on CAC instead of dividing by zero', () => {
    const out = rankCreatives([mk('none', 500, 0), mk('good', 500, 25)], 'CAC');
    expect(out[0].id).toBe('good');
    expect(out.map((c) => c.id)).toEqual(['good', 'none']);
  });

  it('is a total order, so the list cannot reshuffle between renders', () => {
    const tied = [mk('c', 100, 5), mk('a', 100, 5), mk('b', 100, 5)];
    const once = rankCreatives(tied, 'Leads').map((c) => c.id);
    const twice = rankCreatives([...tied].reverse(), 'Leads').map((c) => c.id);
    expect(once).toEqual(twice);
  });

  it('does not mutate the list it was given', () => {
    const list = [mk('a', 1, 1), mk('b', 9, 9)];
    const before = list.map((c) => c.id);
    rankCreatives(list, 'Spend');
    expect(list.map((c) => c.id)).toEqual(before);
  });

  it('gives every campaign enough ads for a top three to mean something', () => {
    for (const c of CAMPAIGNS) {
      expect(creativesFor(c.id).length, `${c.name}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('leaves a running campaign with running ads to rank', () => {
    for (const c of CAMPAIGNS) {
      /* A campaign whose ad sets are all paused correctly has no live ads --
         that is the data being honest, not a gap. Only campaigns with a
         running ad set are asserted to have something to show. */
      if (c.adSets.every((a) => a.stage === 'Paused')) continue;
      const active = creativesFor(c.id).filter((cr) => cr.stage !== 'Paused');
      expect(active.length, `${c.name} active ads`).toBeGreaterThan(0);
    }
  });

  it('a fully paused campaign still has ads to show — the section must not read as empty', () => {
    const paused = CAMPAIGNS.filter((c) => c.adSets.every((a) => a.stage === 'Paused'));
    for (const c of paused) {
      expect(creativesFor(c.id).length, `${c.name}`).toBeGreaterThan(0);
      expect(creativesFor(c.id).every((cr) => cr.stage === 'Paused')).toBe(true);
    }
  });
});
