import { useState } from 'react';
import './screens.css';
import { KpiCard } from '../components/KpiCard/KpiCard';
import { Chart } from '../components/Chart/Chart';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { StatusMenu } from '../components/StatusMenu/StatusMenu';
import { setStage, useCampaignStatus } from '../data/campaignStatus';
import { toggleFlag, useFlags } from '../data/attention';
import { ChannelWordmark } from '../components/ChannelWordmark/ChannelWordmark';
import { Button } from '../components/Button/Button';
import {
  campaignById, campaignDelta, campaignSeries, campaignSparkline, campaignTotals,
} from '../data/campaignSeries';
import { CHANNEL_LABEL, formatMetric, type Metric, type Range } from '../data/metrics';
import { betterHigher, formatDerived, headlineFor, kpisFor, trendMark, valueOf, type DerivedMetric } from '../data/channelMetrics';
import { benchmarkFor, benchmarkLabel, benchmarkTitle } from '../data/benchmark';
import { creativesFor } from '../data/creative';
import { adSetTotals } from '../data/adSets';
import { groupNoun } from '../data/channelDepth';
import { CreativeSection } from '../components/CreativeCard/CreativeSection';
import { CompareCard } from '../components/CompareCard/CompareCard';

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
  /** Opens the assistant on a question -- "talk through the difference". */
  onAsk?: (question: string) => void;
  /** Opens one ad's own page. */
  onOpenAd?: (id: string) => void;
  /** Opens one ad set's own page — the tier between this page and an ad. */
  onOpenAdSet?: (id: string) => void;
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
  id, metric, range, onBack, onDiscuss, onAsk, onOpenAd, onOpenAdSet,
  backLabel = 'Campaigns', wideColumns = true,
}: CampaignDetailProps) {
  const campaign = campaignById(id);
  /* Subscribed here so the pill re-renders when the table, or a second tab,
     changes it. */
  const stageOf = useCampaignStatus();
  /* Subscribed, so flagging from anywhere else repaints this button. */
  const flagged = useFlags().some((f) => f.kind === 'campaign' && f.refId === id);

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
  /* The ad sets' share of the campaign, over the SELECTED dates -- the same
     ranged totals each row shows (adSetTotals), summed once. */
  const rangedSpend = campaign.adSets.reduce((a, s) => a + adSetTotals(s.id, range).spend, 0);

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

          {/* Assigning attention, from the page where you would decide it.

              The Overview strip could only ever show what the data noticed. A
              campaign can be worth watching for reasons the numbers have not
              caught yet -- a creative everyone is bored of, a promo ending
              Friday -- and this is where a person is looking when they realise
              it. */}
          <button
            type="button"
            className={`gr-flag-btn gr-type-caption-med ${flagged ? 'is-on' : ''}`}
            aria-pressed={flagged}
            onClick={() => toggleFlag('campaign', campaign.id, campaign.name)}
          >
            <span aria-hidden="true">⚑</span>
            {flagged ? 'On your attention list' : 'Flag for attention'}
          </button>
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
              /* Period delta ONLY when there is no benchmark to show instead.

                 On a campaign page the useful comparison is against the rest of
                 the account, not against last fortnight -- so the benchmark
                 takes the pill. Channels running a single campaign (YouTube,
                 Podcasts, Affiliates) have no benchmark, and those cards fall
                 back to the delta rather than rendering a label, a number and
                 nothing else, which is how they looked before either existed. */
              deltaPercent={b ? undefined : campaignDelta(campaign.id, m, range)}
              sparkline={campaignSparkline(campaign.id, m, range)}
              sparklineMark={trendMark(m)}
              benchmark={b ? {
                percent: b.deltaPercent,
                note: benchmarkLabel(m, b, CHANNEL_LABEL[campaign.channel]),
                title: benchmarkTitle(m, b, CHANNEL_LABEL[campaign.channel]),
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
        compareSeries={(m) => campaignSeries(id, m, range)}
        periodSeries={(m, sh) => campaignSeries(id, m, range, sh)}
        title={`${chartMetric} over time`}
      />

      <CompareCard campaignId={campaign.id} range={range} onAsk={onAsk} />

      {/* Creative sits ABOVE ad sets on purpose. "Which ad is working" is the
          question this page gets opened for; the ad-set table is the breakdown
          you go to afterwards. */}
      <section className="gr-card gr-creative-section">
        {/* Header renders inside CreativeSection, which is what owns the
            filters -- so the count and the filtered list can never disagree. */}
        <CreativeSection channel={campaign.channel} creatives={creatives} onOpenAd={onOpenAd} range={range} />

        {/* Said once, here, rather than implied by every frame. */}
        <p className="gr-type-caption gr-campaign__note">
          One master asset, cropped to each placement. Video stills render once the
          ad account is connected. Figures follow the date range and match each
          ad&rsquo;s own page.
        </p>
      </section>

      <section className="gr-card">
        <header className="gr-card__header">
          {/* The platform's own word, not Meta's for everybody. */}
          <h3 className="gr-card__title gr-type-card-heading">{groupNoun(campaign.channel).many}</h3>
          <span className="gr-type-caption">{campaign.adSets.length}</span>
        </header>
        <table className="gr-table">
          <thead>
            <tr className="gr-type-overline">
              <th scope="col">{groupNoun(campaign.channel).one}</th>
              <th scope="col">Status</th>
              <th scope="col">Spend</th>
              {wideColumns && <th scope="col">Share</th>}
              <th scope="col">Leads</th>
              <th scope="col">CAC</th>
            </tr>
          </thead>
          <tbody>
            {campaign.adSets.map((a) => {
              /* ⭐ Ranged totals, not the static figures off the record. These
                 rows used to sit still while every other number on the page
                 moved with the range picker, and the page had to apologise for
                 it in a caption underneath. Now they derive from the same daily
                 rows the chart above does. */
              const at = adSetTotals(a.id, range);
              const open = () => onOpenAdSet?.(a.id);
              return (
                <tr key={a.id} className="gr-campaign__adset-row">
                  <td className="gr-type-body-medium gr-cell--name">
                    {/* A button, not a click handler on the row: the name is the
                        thing you are activating, and a real button is reachable
                        by keyboard and announced as one. */}
                    {onOpenAdSet ? (
                      <button type="button" className="gr-unbutton gr-campaign__adset-open" onClick={open}>
                        {a.name}
                      </button>
                    ) : a.name}
                  </td>
                  <td className="gr-cell--status"><StatusPill stage={a.stage} /></td>
                  <td className="gr-type-body gr-cell--spend"><span className="gr-table__label gr-type-caption" aria-hidden="true">Spend</span>{formatMetric('Spend', at.spend)}</td>
                  {/* Share of the campaign, so a reader can see which one is
                      actually carrying it without doing the division. */}
                  {/* 🐛 Was the STATIC a.spend over the static sum -- the one figure on
                      the row that did not follow the range (same bug the ad set
                      page had). Ranged spend over the ranged campaign total now. */}
                  {wideColumns && (
                    <td className="gr-type-body gr-cell--share">
                      {rangedSpend > 0 ? `${Math.round((at.spend / rangedSpend) * 100)}%` : '—'}
                    </td>
                  )}
                  <td className="gr-type-body gr-cell--leads"><span className="gr-table__label gr-type-caption" aria-hidden="true">Leads</span>{Math.round(at.leads).toLocaleString()}</td>
                  <td className="gr-type-body gr-cell--cac">
                    <span className="gr-table__label gr-type-caption" aria-hidden="true">CAC</span>{at.leads > 0 ? formatMetric('CAC', at.cac) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
