import { describe, it, expect } from 'vitest';
import { CHANNEL_KEYS, RANGES, canProduce, rowsFor, setActiveChannels } from '../metrics';
import { CHANNEL_METRICS } from '../channelMetrics';
import { buildCsv } from '../exportCsv';
import { CAMPAIGNS } from '../campaigns';
import { creativeRows, creativesFor } from '../creative';
import { adSetRows, adSetTotals } from '../adSets';
import { campaignTotals } from '../campaignSeries';

const reset = () => setActiveChannels([...CHANNEL_KEYS]);

describe('G-011 — the data no longer invents what a medium cannot produce', () => {
  it('a podcast has zero clicks, every day, at every range', () => {
    /* An audio ad has nothing to click. The data used to say 7,919. */
    for (const range of RANGES) {
      for (const r of rowsFor('podcasts', range)) expect(r.clicks).toBe(0);
    }
  });

  it('affiliates have zero impressions', () => {
    /* Paid on performance — exposure is neither bought nor reported. */
    for (const range of RANGES) {
      for (const r of rowsFor('affiliates', range)) expect(r.impressions).toBe(0);
    }
  });

  it('⭐ Paid Search KEEPS its impressions, because it reports CTR', () => {
    /* The refinement that stopped this being driven off CHANNEL_METRICS.

       CHANNEL_METRICS omits Impressions from Paid Search's DISPLAY vocabulary —
       impressions are context there, not the buy. But Google Ads genuinely
       reports them, and Paid Search displays CTR, which needs impressions as a
       denominator. Zeroing on the display table would have left Paid Search
       claiming a CTR with nothing underneath it. */
    expect(canProduce('paidSearch', 'impressions')).toBe(true);
    expect(rowsFor('paidSearch', 30).every((r) => r.impressions > 0)).toBe(true);
    expect(CHANNEL_METRICS.paidSearch).toContain('CTR');
    expect(CHANNEL_METRICS.paidSearch).not.toContain('Impressions');
  });

  it('nothing that cannot be produced is offered for display', () => {
    /* The two tables do different jobs, so they are allowed to differ — but not
       in this direction. Displaying a metric the medium cannot generate would
       show a structural zero as though it were a measurement. */
    for (const c of CHANNEL_KEYS) {
      if (!canProduce(c, 'clicks')) expect(CHANNEL_METRICS[c]).not.toContain('Clicks');
      if (!canProduce(c, 'impressions')) expect(CHANNEL_METRICS[c]).not.toContain('Impressions');
    }
  });

  it('rate metrics needing a missing denominator are not offered either', () => {
    for (const c of CHANNEL_KEYS) {
      if (!canProduce(c, 'clicks')) {
        for (const m of ['CTR', 'CPC', 'CVR'] as const) {
          expect(CHANNEL_METRICS[c], `${c} ${m}`).not.toContain(m);
        }
      }
      if (!canProduce(c, 'impressions')) {
        for (const m of ['CTR', 'CPM'] as const) {
          expect(CHANNEL_METRICS[c], `${c} ${m}`).not.toContain(m);
        }
      }
    }
  });
});

describe('G-011 — the export stops writing the fiction into a file', () => {
  it('a podcast export leaves the Clicks cell BLANK, not zero', () => {
    reset();
    const csv = buildCsv('podcasts', 30);
    const body = csv.split('\n').slice(1);
    for (const row of body) {
      const cells = row.split(',');
      /* Period, Channel, Spend, Clicks -> index 3. Empty, not "0".
         ⚠️ In a spreadsheet a zero is a value: it sums, it averages, and it drags
         a CTR column down as though the ad performed badly. An empty cell is
         excluded from both. */
      expect(cells[3]).toBe('');
    }
  });

  it('a channel that does have clicks still exports them', () => {
    reset();
    const csv = buildCsv('meta', 30);
    const cells = csv.split('\n')[1].split(',');
    expect(Number(cells[3])).toBeGreaterThan(0);
  });
});

describe('G-013 — ad performance actually varies now', () => {
  it('two ads in one campaign have DIFFERENT CACs', () => {
    reset();
    /* The whole point. They used to be identical to the cent: c1a-cr1 and
       c1a-cr3 both came out at $34.31, so "which ad is underperforming" had no
       answer and two decision detectors could never fire. */
    const c = CAMPAIGNS.find((x) => creativesFor(x.id).length >= 3)!;
    const cacs = creativesFor(c.id).map((ad) => {
      const t = creativeRows(ad.id, 30).reduce(
        (a, r) => ({ spend: a.spend + r.spend, leads: a.leads + r.leads }),
        { spend: 0, leads: 0 });
      return t.leads > 0 ? t.spend / t.leads : 0;
    });
    expect(new Set(cacs.map((v) => v.toFixed(2))).size).toBeGreaterThan(1);
  });

  it('ad sets within a campaign have different CACs too', () => {
    reset();
    const c = CAMPAIGNS.find((x) => x.adSets.length >= 3)!;
    const cacs = c.adSets.map((a) => adSetTotals(a.id, 30).cac.toFixed(2));
    expect(new Set(cacs).size).toBeGreaterThan(1);
  });

  it('⭐ but ads still sum to their AD SET, exactly', () => {
    reset();
    /* The composition that makes the wobble safe. Wobbling ads directly against
       the campaign would have left them adding up to the campaign while
       disagreeing with the ad-set row printed right above them — the worst of
       the three options, because nothing on screen admits to it. */
    for (const range of RANGES) {
      for (const c of CAMPAIGNS) {
        const ads = creativesFor(c.id);
        for (const a of c.adSets) {
          const mine = ads.filter((x) => x.adSetId === a.id);
          if (mine.length === 0) continue;
          const leads = mine.reduce((sum, ad) =>
            sum + creativeRows(ad.id, range).reduce((t, r) => t + r.leads, 0), 0);
          expect(leads).toBeCloseTo(adSetTotals(a.id, range).leads, 6);
        }
      }
    }
  });

  it('⭐ and ad sets still sum to their CAMPAIGN, exactly', () => {
    reset();
    for (const range of RANGES) {
      for (const c of CAMPAIGNS) {
        const leads = c.adSets.reduce((a, x) => a + adSetTotals(x.id, range).leads, 0);
        expect(leads).toBeCloseTo(campaignTotals(c.id, range).leads, 6);
        const spend = c.adSets.reduce((a, x) => a + adSetTotals(x.id, range).spend, 0);
        expect(spend).toBeCloseTo(campaignTotals(c.id, range).spend, 6);
      }
    }
  });

  it('spend shares are untouched — the wobble moves efficiency, not size', () => {
    reset();
    /* A big ad set stays big. Only its CAC moves. */
    for (const c of CAMPAIGNS) {
      const total = c.adSets.reduce((a, x) => a + x.spend, 0);
      for (const a of c.adSets) {
        const rows = adSetRows(a.id, 30);
        const spend = rows.reduce((t, r) => t + r.spend, 0);
        const expected = campaignTotals(c.id, 30).spend * (a.spend / total);
        expect(spend).toBeCloseTo(expected, 6);
      }
    }
  });

  it('the wobble is deterministic — same ad, same number, every call', () => {
    reset();
    const ad = creativesFor(CAMPAIGNS[0].id)[0];
    const once = creativeRows(ad.id, 30).reduce((a, r) => a + r.leads, 0);
    const twice = creativeRows(ad.id, 30).reduce((a, r) => a + r.leads, 0);
    expect(once).toBe(twice);
  });
});
