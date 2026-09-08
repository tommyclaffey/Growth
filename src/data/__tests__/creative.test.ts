import { describe, expect, it } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import { creativesFor } from '../creative';

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
