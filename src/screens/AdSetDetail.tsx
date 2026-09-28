import { useState } from 'react';
import './screens.css';
import { KpiCard } from '../components/KpiCard/KpiCard';
import { Chart } from '../components/Chart/Chart';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { Button } from '../components/Button/Button';
import { ChannelWordmark } from '../components/ChannelWordmark/ChannelWordmark';
import { CreativeSection } from '../components/CreativeCard/CreativeSection';
import { adSetById, adSetDelta, adSetSeries, adSetSparkline, adSetTotals } from '../data/adSets';
import { creativesFor } from '../data/creative';
import { groupNoun } from '../data/channelDepth';
import {
  betterHigher, formatDerived, headlineFor, kpisFor, trendMark, valueOf,
  type DerivedMetric,
} from '../data/channelMetrics';
import { CHANNEL_LABEL, formatMetric, type Metric, type Range } from '../data/metrics';

export interface AdSetDetailProps {
  id: string;
  range: Range;
  metric: Metric;
  onBack: () => void;
  backLabel?: string;
  /** Opens one ad's own page, so the chain continues downward. */
  onOpenAd?: (id: string) => void;
}

/**
 * One ad set, in full — the tier that used to have no page.
 *
 * ⭐ Why this page has to exist: it is where media buying happens. Budget,
 * audience, placement and bid are set at this level, not on the campaign above
 * and not on the ad below. The product let you go campaign → ad, which skipped
 * the level a buyer works in all day.
 *
 * The shape deliberately mirrors CampaignDetail: header, KPI row, chart, then
 * the things inside it. Two pages one click apart should not present the same
 * kind of information two different ways, and the reader should not have to
 * relearn the layout on every step down the hierarchy.
 *
 * Everything derives from `adSetRows`, which is a constant share of the
 * campaign's daily rows — so this page, the campaign page and the channel
 * screen are reading the same numbers rather than three calculations that
 * happen to agree today.
 */
export function AdSetDetail({
  id, range, metric, onBack, backLabel = 'Campaign', onOpenAd,
}: AdSetDetailProps) {
  const ref = adSetById(id);

  /* Opens on what the campaign was built to move, same rule as CampaignDetail.
     Above the early return, because hooks cannot run conditionally. */
  const [chartMetric, setChartMetric] = useState<Metric>(() => {
    if (!ref) return metric;
    const h = headlineFor(ref.campaign.channel, ref.campaign.objective);
    return (['Spend', 'Clicks', 'Leads', 'Sales', 'CAC', 'ROAS'] as string[]).includes(h)
      ? (h as Metric) : 'Spend';
  });

  if (!ref) {
    return (
      <div className="gr-card gr-campaign__missing">
        <p className="gr-type-body">That ad set no longer exists.</p>
        <Button variant="ghost" onClick={onBack}>Back to {backLabel.toLowerCase()}</Button>
      </div>
    );
  }

  const { adSet, campaign } = ref;
  const noun = groupNoun(campaign.channel);
  const t = adSetTotals(id, range);
  const shown: DerivedMetric[] = kpisFor(campaign.channel, campaign.objective);

  /* Only this ad set's ads. The campaign page shows all of them; filtering here
     is what makes this a level rather than a second copy of its parent. */
  const creatives = creativesFor(campaign.id).filter((c) => c.adSetId === id);

  /* Share of the campaign, from the same function the numbers come from -- not
     recomputed here from the static totals, which would let the caption and the
     figures disagree the moment the range moved. */
  const campaignSpend = campaign.adSets.reduce((a, x) => a + x.spend, 0);
  const share = campaignSpend > 0 ? adSet.spend / campaignSpend : 0;

  return (
    <>
      <header className="gr-campaign__head">
        <button type="button" className="gr-crumb gr-type-caption" onClick={onBack}>
          <span aria-hidden="true">‹</span> {backLabel}
        </button>
        {/* The full lockup, the same one the campaign and ad pages carry. Half a
            lockup reads as the other half failing to load. */}
        <ChannelWordmark channel={campaign.channel} name={CHANNEL_LABEL[campaign.channel]} size="sm" />
        <div className="gr-campaign__title">
          <h2 className="gr-type-section">{adSet.name}</h2>
          <StatusPill stage={adSet.stage} />
        </div>
        {/* Named in the platform's own vocabulary -- "Ad set" on Meta, "Ad
            group" on Google and TikTok, "Partner" on affiliates, "Show" on
            podcasts. Calling all six an ad set was speaking Meta's dialect to
            everybody. */}
        <p className="gr-type-caption gr-campaign__meta">
          {noun.one} · {campaign.name} · {campaign.objective}
          {` · ${Math.round(share * 100)}% of campaign spend`}
        </p>
      </header>

      <div className="gr-kpi-row">
        {shown.map((m) => (
          <KpiCard
            key={m}
            label={m}
            value={formatDerived(m, valueOf(m, t))}
            higherIsBetter={betterHigher(m)}
            channel={campaign.channel}
            deltaPercent={adSetDelta(id, m, range)}
            sparkline={adSetSparkline(id, m, range)}
            sparklineMark={trendMark(m)}
          />
        ))}
      </div>

      <Chart
        channel={campaign.channel}
        metric={chartMetric}
        onMetricChange={setChartMetric}
        data={adSetSeries(id, chartMetric, range)}
        compareSeries={(m) => adSetSeries(id, m, range)}
        title={`${chartMetric} over time`}
      />

      <section className="gr-card gr-creative-section">
        <CreativeSection
          channel={campaign.channel}
          creatives={creatives}
          onOpenAd={onOpenAd}
        />
        <p className="gr-type-caption gr-campaign__note">
          One master asset, cropped to each placement. Figures are this {noun.one.toLowerCase()}&rsquo;s
          share of the campaign and follow the date range.
        </p>
      </section>

      <p className="gr-type-caption gr-campaign__note">
        {formatMetric('Spend', t.spend)} spend · {Math.round(t.leads).toLocaleString()} leads ·
        {' '}{formatMetric('CAC', t.cac)} CAC over the selected range.
      </p>
    </>
  );
}
