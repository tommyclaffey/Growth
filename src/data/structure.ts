import { setCampaigns, type Campaign } from './campaigns';
import { setCampaignRows } from './campaignSeries';
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
export function applyStructure(campaigns: SourceCampaign[] | undefined): void {
  if (!campaigns) {
    setCampaigns(null);
    setCampaignRows(null);
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
      adSets: [],
    };
  }));
  setCampaignRows(new Map(campaigns.map((c) => [c.id, c.rows])));
}
