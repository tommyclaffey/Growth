import { setCampaigns, type Campaign } from './campaigns';
import { setCampaignRows } from './campaignSeries';
import { setAdSetRows } from './adSets';
import { setSourceAds, type Creative } from './creative';
import type { SourceCampaign } from './source';

/**
 * Apply a source's campaign structure -- or restore the seed's.
 *
 * A real account's campaigns replace the demo's everywhere at once: tables,
 * pages, the decision engine, notifications, the assistant. Each keeps its OWN
 * daily rows (never re-derived as a share of the channel, which is only how the
 * seed fakes campaign days). Real campaigns arrive without ad sets or ads --
 * that level is a later load -- and every screen already handles "none".
 */
let STRUCTURE = 0;
/** Bumped on every applyStructure() -- ads and ad sets change with it. */
export function structureVersion(): number { return STRUCTURE; }

export function applyStructure(campaigns: SourceCampaign[] | undefined): void {
  STRUCTURE += 1;
  if (!campaigns) {
    setCampaigns(null);
    setCampaignRows(null);
    setAdSetRows(null);
    setSourceAds(null, null);
    return;
  }
  const last30 = (rows: SourceCampaign['rows']) => rows.slice(-30).reduce(
    (a, r) => ({ spend: a.spend + r.spend, leads: a.leads + r.leads, revenue: a.revenue + r.revenue }),
    { spend: 0, leads: 0, revenue: 0 },
  );
  setCampaigns(campaigns.map((c): Campaign => {
    const t = last30(c.rows);
    return {
      id: c.id, name: c.name, channel: c.channel, stage: c.stage, objective: c.objective,
      spend: t.spend, leads: t.leads, roas: t.spend > 0 ? t.revenue / t.spend : 0,
      adSets: (c.adSets ?? []).map((a) => {
        const at = last30(a.rows);
        return { id: a.id, name: a.name, spend: at.spend, leads: at.leads, stage: a.stage };
      }),
    };
  }));
  setCampaignRows(new Map(campaigns.map((c) => [c.id, c.rows])));
  setAdSetRows(new Map(campaigns.flatMap((c) => (c.adSets ?? []).map((a) => [a.id, a.rows] as const))));
  /* Ads REPLACE the generator for every campaign -- a campaign whose ads were
     not loaded shows none, never the demo's invented ones. */
  const adSetName = new Map(campaigns.flatMap((c) => (c.adSets ?? []).map((a) => [a.id, a.name] as const)));
  setSourceAds(
    new Map(campaigns.map((c) => [c.id, (c.ads ?? []).map((ad): Creative => {
      const t = last30(ad.rows);
      return {
        id: ad.id, adSetId: ad.adSetId, adSetName: adSetName.get(ad.adSetId) ?? '',
        kind: ad.kind, headline: ad.headline || ad.name, body: ad.body, src: ad.src,
        stage: ad.stage, spend: t.spend, leads: t.leads,
      } as Creative;
    })])),
    new Map(campaigns.flatMap((c) => (c.ads ?? []).map((ad) => [ad.id, ad.rows] as const))),
  );
}
