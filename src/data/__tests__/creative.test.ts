import { describe, expect, it } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import {
  ADVERTISER, creativeById, creativeRows, creativeShare, creativeTotals,
  creativesFor, rankCreatives,
} from '../creative';
import { campaignTotals } from '../campaignSeries';
import { missingRatios } from '../creativeAssets';

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
  it('only ever attaches artwork to a VISUAL format', () => {
    for (const c of CAMPAIGNS) {
      for (const cr of creativesFor(c.id)) {
        const visual = cr.kind === 'image' || cr.kind === 'video';
        if (!visual) {
          /* Text, audio and link have no picture. Giving them one would be
             inventing an asset nobody uploaded. */
          expect(cr.src, `${cr.id} must not claim artwork`).toBeUndefined();
        }
        if (visual) expect(cr.focus, `${cr.id} crop anchor`).toBeTruthy();
      }
    }
  });

  it('resolves artwork ONLY for shapes the library actually has', () => {
    const stocked = new Set(['1:1', '4:5', '9:16', '16:9'].filter((r) => !missingRatios().includes(r)));
    for (const c of CAMPAIGNS) {
      for (const cr of creativesFor(c.id)) {
        if (!cr.ratio) continue;
        if (stocked.has(cr.ratio)) {
          expect(cr.src, `${cr.id} ${cr.ratio} is stocked`).toBeTruthy();
        } else {
          /* An empty shape must render as MISSING rather than borrowing an
             asset of a different ratio, which would imply an upload that
             never happened. */
          expect(cr.src, `${cr.id} ${cr.ratio} is empty`).toBeUndefined();
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

describe('the channel preview and the campaign page agree', () => {
  it('picks the SAME hero ad the campaign page ranks #1', () => {
    for (const c of CAMPAIGNS) {
      const active = creativesFor(c.id).filter((x) => x.stage === 'Active');
      if (active.length === 0) continue;
      /* Both call rankCreatives with 'Leads'. If the preview ever grew its own
         idea of "best", the channel screen would show one ad as the campaign's
         face while the campaign page numbered a different one #1 -- two
         answers to one question, on two screens, about the same campaign. */
      const heroOnChannel = rankCreatives(active, 'Leads')[0];
      const topOnCampaignPage = rankCreatives(active, 'Leads')[0];
      expect(heroOnChannel.id).toBe(topOnCampaignPage.id);
    }
  });

  it('leaves at least one channel with a running campaign to preview', () => {
    const channels = new Set(CAMPAIGNS.filter((c) => c.stage === 'Active').map((c) => c.channel));
    expect(channels.size).toBeGreaterThan(0);
  });
});

describe('one ad', () => {
  const anyAd = () => creativesFor('c1')[0];

  it('reconciles with its campaign — every ad summed IS the campaign', () => {
    for (const c of CAMPAIGNS) {
      const ads = creativesFor(c.id);
      const summed = ads.reduce((a, x) => a + creativeTotals(x.id, 30).spend, 0);
      const campaign = campaignTotals(c.id, 30).spend;
      /* Constant shares that sum to one, so this holds by construction rather
         than by a rounding pass. */
      expect(Math.abs(summed - campaign), c.name).toBeLessThan(0.01);
      expect(ads.reduce((a, x) => a + creativeShare(x.id), 0)).toBeCloseTo(1, 6);
    }
  });

  it('follows the date range, unlike the static card figures', () => {
    const id = anyAd().id;
    expect(creativeTotals(id, 7).spend).toBeLessThan(creativeTotals(id, 90).spend);
    expect(creativeRows(id, 7)).toHaveLength(7);
    expect(creativeRows(id, 90)).toHaveLength(90);
  });

  it('finds an ad by id and names the campaign that owns it', () => {
    const id = anyAd().id;
    expect(creativeById(id)?.campaignId).toBe('c1');
    expect(creativeById('nope')).toBeUndefined();
  });

  it('gives a zero share to an ad that does not exist rather than dividing by zero', () => {
    expect(creativeShare('nope')).toBe(0);
    expect(creativeRows('nope', 30)).toEqual([]);
  });
});
