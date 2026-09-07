import { useState } from 'react';
import './screens.css';
import { KpiCard } from '../components/KpiCard/KpiCard';
import { Chart } from '../components/Chart/Chart';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { ChannelWordmark } from '../components/ChannelWordmark/ChannelWordmark';
import { Button } from '../components/Button/Button';
import { campaignById, campaignSeries, campaignTotals } from '../data/campaignSeries';
import { CHANNEL_LABEL, formatMetric, higherIsBetter, type Metric, type Range } from '../data/metrics';

/**
 * Which metrics a campaign is judged on, by what it was built to do.
 *
 * Every campaign showed Spend / Leads / CAC / ROAS regardless of objective.
 * ROAS on an Awareness campaign is a number the campaign was never trying to
 * move — printing it invites a reader to judge the work against a goal nobody
 * set. That is the same defect as a label the code does not honour, one layer
 * up: a metric the STRATEGY does not honour.
 *
 * Spend leads every set, because it is the one question every objective shares.
 */
const BY_OBJECTIVE: Record<string, Metric[]> = {
  Awareness:   ['Spend', 'Clicks', 'Leads', 'CAC'],
  Traffic:     ['Spend', 'Clicks', 'Leads', 'CAC'],
  Conversions: ['Spend', 'Leads', 'CAC', 'ROAS'],
  Sales:       ['Spend', 'Sales', 'ROAS', 'CAC'],
};

/* The metric the chart opens on — the one the campaign is actually for. */
const HEADLINE: Record<string, Metric> = {
  Awareness: 'Clicks', Traffic: 'Clicks', Conversions: 'Leads', Sales: 'Sales',
};

export interface CampaignDetailProps {
  id: string;
  metric: Metric;
  range: Range;
  onBack: () => void;
  wideColumns?: boolean;
}

/**
 * One campaign, in full.
 *
 * The table gives a campaign one row and an expandable list of ad sets; that
 * answers "how is it doing" and nothing else. It cannot answer "how did it get
 * here", because a row has no time axis.
 *
 * Everything here derives from `campaignSeries`, which derives from the
 * channel's daily rows — so the numbers on this page and the numbers on the
 * Campaigns table and the numbers on the channel screen are the same numbers,
 * not three calculations that agree today.
 */
export function CampaignDetail({
  id, metric, range, onBack, wideColumns = true,
}: CampaignDetailProps) {
  const campaign = campaignById(id);

  /* The chart opens on the metric this campaign was built to move -- Clicks for
     Awareness, Sales for a Sales campaign -- rather than on whatever the last
     screen happened to be showing.

     Held LOCALLY, not lifted to App. Changing the app-wide metric as a side
     effect of opening a page would silently rewrite what Overview shows after
     you navigate back, which is a worse surprise than the toggle not being
     shared. The hook sits above the early return because hooks cannot run
     conditionally. */
  const [chartMetric, setChartMetric] = useState<Metric>(
    () => (campaign ? HEADLINE[campaign.objective] ?? metric : metric),
  );

  /* A campaign id can arrive from a stale link or a deleted record. Landing on
     a blank screen with no way out is worse than saying so. */
  if (!campaign) {
    return (
      <div className="gr-card gr-campaign__missing">
        <p className="gr-type-body">That campaign no longer exists.</p>
        <Button variant="ghost" onClick={onBack}>Back to campaigns</Button>
      </div>
    );
  }

  const t = campaignTotals(id, range);
  const data = campaignSeries(id, chartMetric, range);
  const adSetSpend = campaign.adSets.reduce((a, s) => a + s.spend, 0);

  /* Unknown objectives fall back to the conversions set rather than rendering
     nothing — a new objective string should degrade, not blank the page. */
  const shown = BY_OBJECTIVE[campaign.objective] ?? BY_OBJECTIVE.Conversions;
  const valueOf = (m: Metric) => (
    m === 'Spend' ? t.spend : m === 'Clicks' ? t.clicks : m === 'Leads' ? t.leads
      : m === 'Sales' ? t.sales : m === 'CAC' ? t.cac : t.roas
  );

  return (
    <>
      <header className="gr-campaign__head">
        <button type="button" className="gr-crumb gr-type-caption" onClick={onBack}>
          <span aria-hidden="true">‹</span> Campaigns
        </button>
        {/* The channel's own lockup, the same one its channel screen uses, so
            the page reads as belonging to Meta or TikTok rather than as a
            generic record that happens to name one. */}
        <ChannelWordmark channel={campaign.channel} name={CHANNEL_LABEL[campaign.channel]} size="sm" />
        <div className="gr-campaign__title">
          <h2 className="gr-type-section">{campaign.name}</h2>
          <StatusPill stage={campaign.stage} />
        </div>
        <p className="gr-type-caption gr-campaign__meta">
          {campaign.objective} · {campaign.adSets.length} ad set{campaign.adSets.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="gr-kpi-row">
        {shown.map((m) => (
          <KpiCard
            key={m}
            label={m}
            value={formatMetric(m, valueOf(m))}
            metric={m}
            higherIsBetter={higherIsBetter(m)}
            channel={campaign.channel}
          />
        ))}
      </div>

      <Chart
        channel={campaign.channel}
        metric={chartMetric}
        onMetricChange={setChartMetric}
        data={data}
        title={`${chartMetric} over time`}
      />

      <section className="gr-card">
        <header className="gr-card__header">
          <h3 className="gr-card__title gr-type-card-heading">Ad sets</h3>
          <span className="gr-type-caption">{campaign.adSets.length}</span>
        </header>
        <table className="gr-table">
          <thead>
            <tr className="gr-type-overline">
              <th scope="col">Ad set</th>
              <th scope="col">Status</th>
              <th scope="col">Spend</th>
              {wideColumns && <th scope="col">Share</th>}
              <th scope="col">Leads</th>
              <th scope="col">CAC</th>
            </tr>
          </thead>
          <tbody>
            {campaign.adSets.map((a) => (
              <tr key={a.id} className="gr-campaign__adset-row">
                <td className="gr-type-body-medium">{a.name}</td>
                <td><StatusPill stage={a.stage} /></td>
                <td className="gr-type-body">{formatMetric('Spend', a.spend)}</td>
                {/* Share of the campaign, so a reader can see which ad set is
                    actually carrying it without doing the division. */}
                {wideColumns && (
                  <td className="gr-type-body">
                    {adSetSpend > 0 ? `${Math.round((a.spend / adSetSpend) * 100)}%` : '—'}
                  </td>
                )}
                <td className="gr-type-body">{a.leads.toLocaleString()}</td>
                <td className="gr-type-body">
                  {a.leads > 0 ? formatMetric('CAC', a.spend / a.leads) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Ad sets are static totals — they do not have daily series. Saying so
            is better than letting a reader assume the range picker moved them. */}
        <p className="gr-type-caption gr-campaign__note">
          Ad set figures are period totals and do not follow the date range.
        </p>
      </section>
    </>
  );
}
