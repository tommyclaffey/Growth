import { useState } from 'react';
import './screens.css';
import { KpiCard } from '../components/KpiCard/KpiCard';
import { Chart } from '../components/Chart/Chart';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { StatusMenu } from '../components/StatusMenu/StatusMenu';
import { setStage, useCampaignStatus } from '../data/campaignStatus';
import { ChannelWordmark } from '../components/ChannelWordmark/ChannelWordmark';
import { Button } from '../components/Button/Button';
import {
  campaignById, campaignDelta, campaignSeries, campaignSparkline, campaignTotals,
} from '../data/campaignSeries';
import { CHANNEL_LABEL, formatMetric, type Metric, type Range } from '../data/metrics';
import { betterHigher, formatDerived, headlineFor, kpisFor, valueOf, type DerivedMetric } from '../data/channelMetrics';
import { benchmarkFor, benchmarkLabel } from '../data/benchmark';
import { CREATIVE_NOUN, creativesFor } from '../data/creative';
import { CreativeCard } from '../components/CreativeCard/CreativeCard';

export interface CampaignDetailProps {
  id: string;
  metric: Metric;
  range: Range;
  onBack: () => void;
  /** Where Back actually goes. The crumb must not name a screen it does not
      return to -- arriving from Meta and being offered "Campaigns" sends you
      somewhere you were never looking at. */
  backLabel?: string;
  /** Stages this campaign's metric as a card in the chat composer. */
  onDiscuss?: (metric: DerivedMetric) => void;
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
  id, metric, range, onBack, onDiscuss, backLabel = 'Campaigns', wideColumns = true,
}: CampaignDetailProps) {
  const campaign = campaignById(id);
  /* Subscribed here so the pill re-renders when the table, or a second tab,
     changes it. */
  const stageOf = useCampaignStatus();

  /* The chart opens on the metric this campaign was built to move -- Clicks for
     Awareness, Sales for a Sales campaign -- rather than on whatever the last
     screen happened to be showing.

     Held LOCALLY, not lifted to App. Changing the app-wide metric as a side
     effect of opening a page would silently rewrite what Overview shows after
     you navigate back, which is a worse surprise than the toggle not being
     shared. The hook sits above the early return because hooks cannot run
     conditionally. */
  const [chartMetric, setChartMetric] = useState<Metric>(() => {
    if (!campaign) return metric;
    /* The chart opens on the campaign's headline metric when the Chart can
       plot it. Chart speaks the six funnel metrics; CTR, CPM, CPC and CVR are
       derived and have no series, so those fall back to Spend rather than
       rendering an empty plot. */
    const h = headlineFor(campaign.channel, campaign.objective);
    return (['Spend', 'Clicks', 'Leads', 'Sales', 'CAC', 'ROAS'] as string[]).includes(h)
      ? (h as Metric) : 'Spend';
  });

  /* A campaign id can arrive from a stale link or a deleted record. Landing on
     a blank screen with no way out is worse than saying so. */
  if (!campaign) {
    return (
      <div className="gr-card gr-campaign__missing">
        <p className="gr-type-body">That campaign no longer exists.</p>
        <Button variant="ghost" onClick={onBack}>Back to {backLabel.toLowerCase()}</Button>
      </div>
    );
  }

  const t = campaignTotals(id, range);
  const data = campaignSeries(id, chartMetric, range);
  const adSetSpend = campaign.adSets.reduce((a, s) => a + s.spend, 0);

  /* What this channel can honestly report, narrowed to what this objective is
     trying to move. A podcast campaign never shows CTR, because a podcast ad
     has no click. */
  const shown: DerivedMetric[] = kpisFor(campaign.channel, campaign.objective);

  /* The assets actually running. Format follows the channel -- a paid-search
     campaign has text ads and no images at all, the same way it has no CPM. */
  const creatives = creativesFor(campaign.id);

  return (
    <>
      <header className="gr-campaign__head">
        <button type="button" className="gr-crumb gr-type-caption" onClick={onBack}>
          <span aria-hidden="true">‹</span> {backLabel}
        </button>
        {/* The channel's own lockup, the same one its channel screen uses, so
            the page reads as belonging to Meta or TikTok rather than as a
            generic record that happens to name one. */}
        <ChannelWordmark channel={campaign.channel} name={CHANNEL_LABEL[campaign.channel]} size="sm" />
        <div className="gr-campaign__title">
          <h2 className="gr-type-section">{campaign.name}</h2>
          {/* Editable here, not just displayed. This is the page you land on to
              decide whether a campaign should keep running, so the decision
              belongs on it -- sending someone back to the table to act on what
              they just read is a dead end with extra steps. */}
          <StatusMenu value={stageOf(campaign.id)} onChange={(next) => setStage(campaign.id, next)} />
        </div>
        <p className="gr-type-caption gr-campaign__meta">
          {campaign.objective} · {campaign.adSets.length} ad set{campaign.adSets.length === 1 ? '' : 's'}
        </p>
      </header>

      <div className="gr-kpi-row">
        {shown.map((m) => {
          const v = valueOf(m, t);
          /* What this channel does on the same metric. A CAC of $34.31 is not
             information on its own -- it becomes information beside the $29.80
             the rest of Meta averages. Null when the channel runs a single
             campaign, because the average would be this campaign. */
          const b = benchmarkFor(campaign.channel, m, range, v);
          return (
            <KpiCard
              key={m}
              label={m}
              value={formatDerived(m, v)}
              higherIsBetter={betterHigher(m)}
              channel={campaign.channel}
              /* The same two marks every KPI card in the product carries.
                 These were missing here, so a campaign on a channel with no
                 peer campaign -- YouTube, Podcasts, Affiliates all run one --
                 rendered a label, a number, and nothing else, while a Meta
                 campaign two clicks away was fully populated. Derived per day
                 from the funnel, so CTR and CPM get a real trend rather than
                 being the only cards on the page without one. */
              deltaPercent={campaignDelta(campaign.id, m, range)}
              sparkline={campaignSparkline(campaign.id, m, range)}
              benchmark={b ? {
                percent: b.deltaPercent,
                note: benchmarkLabel(m, b, CHANNEL_LABEL[campaign.channel]),
              } : undefined}
              /* Same affordance as every other KPI card in the product. A
                 number you cannot ask anyone about is a number you act on
                 alone. */
              onDiscuss={onDiscuss ? () => onDiscuss(m) : undefined}
            />
          );
        })}
      </div>

      <Chart
        channel={campaign.channel}
        metric={chartMetric}
        onMetricChange={setChartMetric}
        data={data}
        title={`${chartMetric} over time`}
      />

      {/* Creative sits ABOVE ad sets on purpose. "Which ad is working" is the
          question this page gets opened for; the ad-set table is the breakdown
          you go to afterwards. */}
      <section className="gr-card gr-creative-section">
        <header className="gr-card__header">
          <h3 className="gr-card__title gr-type-card-heading">
            {CREATIVE_NOUN[campaign.channel]}
          </h3>
          <span className="gr-type-caption">{creatives.length}</span>
        </header>

        <div className="gr-creative-grid">
          {creatives.map((cr) => (
            <CreativeCard key={cr.id} creative={cr} channel={campaign.channel} />
          ))}
        </div>

        {/* Said once, here, rather than implied by six placeholder frames.
            The ratios and durations are real; the pictures are not shot. */}
        <p className="gr-type-caption gr-campaign__note">
          Ratios, durations and copy are live. Image and video previews render once
          the ad account is connected.
        </p>
      </section>

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
