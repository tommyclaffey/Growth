import { useState } from 'react';
import './screens.css';
import { KpiCard } from '../components/KpiCard/KpiCard';
import { Chart } from '../components/Chart/Chart';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { Button } from '../components/Button/Button';
import { ChannelMark } from '../components/ChannelMark/ChannelMark';
import { ChannelWordmark } from '../components/ChannelWordmark/ChannelWordmark';
import { CAMPAIGNS } from '../data/campaigns';
import {
  creativeById, creativeRows, creativeSeries, creativeShare, creativeTotals,
  creativesFor, rankCreatives,
} from '../data/creative';
import {
  betterHigher, formatDerived, kpisFor, valueOf, type DerivedMetric,
} from '../data/channelMetrics';
import { CHANNEL_LABEL, deltaOf, formatMetric, sampleOf, type Metric, type Range } from '../data/metrics';

export interface AdDetailProps {
  id: string;
  range: Range;
  onBack: () => void;
  backLabel?: string;
}

function duration(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/**
 * One ad, in full.
 *
 * The campaign page can say which ad is winning. It cannot say WHY, because a
 * card has room for three figures and no room for the thing being judged at a
 * size you can judge it.
 *
 * Everything here is scaled out of the campaign's daily rows by a constant
 * share, so an ad's numbers reconcile with its campaign's by construction --
 * and unlike the cards, this page follows the date range.
 */
export function AdDetail({ id, range, onBack, backLabel = 'Campaign' }: AdDetailProps) {
  const found = creativeById(id);
  const campaign = CAMPAIGNS.find((c) => c.id === found?.campaignId);

  const [chartMetric, setChartMetric] = useState<Metric>('Spend');

  if (!found || !campaign) {
    return (
      <div className="gr-card gr-campaign__missing">
        <p className="gr-type-body">That ad no longer exists.</p>
        <Button variant="ghost" onClick={onBack}>Back to {backLabel.toLowerCase()}</Button>
      </div>
    );
  }

  const c = found.creative;
  const t = creativeTotals(id, range);
  const visual = c.kind === 'image' || c.kind === 'video';
  const shown: DerivedMetric[] = kpisFor(campaign.channel, campaign.objective);

  /* Where this ad sits among the campaign's ads on the metric the objective is
     trying to move -- the same ranking the campaign page numbers its cards by,
     so #2 here means #2 there. */
  const peers = rankCreatives(creativesFor(campaign.id).filter((x) => x.stage === 'Active'), 'Leads');
  const rank = peers.findIndex((x) => x.id === id) + 1;

  return (
    <>
      <header className="gr-campaign__head">
        <button type="button" className="gr-crumb gr-type-caption" onClick={onBack}>
          <span aria-hidden="true">‹</span> {backLabel}
        </button>
        {/* The same lockup the campaign page uses, not a bare mark.

            These two pages are one click apart and were showing the channel
            differently: the campaign header carries mark plus name, this one
            carried the icon alone. Read as a missing logo rather than as a
            smaller treatment, which is the correct reading -- half of a lockup
            looks like the other half failed to load. */}
        <ChannelWordmark channel={campaign.channel} name={CHANNEL_LABEL[campaign.channel]} size="sm" />
        <div className="gr-campaign__title">
          <h2 className="gr-type-section">{c.headline}</h2>
          <StatusPill stage={c.stage} />
        </div>
        <p className="gr-type-caption gr-campaign__meta">
          {campaign.name} · {c.adSetName}
          {rank > 0 && ` · #${rank} of ${peers.length} by leads`}
        </p>
      </header>

      <div className="gr-ad__split">
        {/* The ad, at a size you can actually assess. This is the page's
            subject; the numbers are the argument about it. */}
        <section className="gr-card gr-ad__preview">
          <div
            className="gr-ad__stage"
            style={visual && c.ratio ? { aspectRatio: c.ratio.replace(':', ' / ') } : undefined}
          >
            {visual && c.src ? (
              <img src={c.src} alt="" style={{ objectPosition: c.focus }} />
            ) : (
              <span className="gr-ad__empty">
                <ChannelMark channel={campaign.channel} size={28} />
                <span className="gr-type-caption">
                  {c.kind === 'video' ? 'No poster frame' : 'No asset'}
                </span>
              </span>
            )}
          </div>

          <dl className="gr-ad__spec">
            <div><dt className="gr-type-overline">Format</dt>
              <dd className="gr-type-body">{c.kind[0].toUpperCase() + c.kind.slice(1)}</dd></div>
            {c.ratio && (
              <div><dt className="gr-type-overline">Ratio</dt>
                <dd className="gr-type-body">{c.ratio}</dd></div>
            )}
            {c.seconds && (
              <div><dt className="gr-type-overline">Length</dt>
                <dd className="gr-type-body">{duration(c.seconds)}</dd></div>
            )}
            <div><dt className="gr-type-overline">Share of campaign</dt>
              <dd className="gr-type-body">{Math.round(creativeShare(id) * 100)}%</dd></div>
          </dl>
        </section>

        <section className="gr-card gr-ad__copy">
          <header className="gr-card__header">
            <h3 className="gr-card__title gr-type-card-heading">Copy</h3>
          </header>
          <dl className="gr-ad__fields">
            <div><dt className="gr-type-overline">Headline</dt>
              <dd className="gr-type-strip">{c.headline}</dd></div>
            <div><dt className="gr-type-overline">Body</dt>
              <dd className="gr-type-body">{c.body}</dd></div>
            {c.cta && (
              <div><dt className="gr-type-overline">Call to action</dt>
                <dd className="gr-type-body">{c.cta}</dd></div>
            )}
            {c.destination && (
              <div><dt className="gr-type-overline">Destination</dt>
                <dd className="gr-type-body">{c.destination}</dd></div>
            )}
          </dl>
        </section>
      </div>

      <div className="gr-kpi-row">
        {shown.map((m) => {
          /* Per-metric daily values, so a rate gets a real trend rather than
             being the only card on the page without one. */
          const daily = creativeRows(id, range).map((r) => valueOf(m, r));
          return (
            <KpiCard
              key={m}
              label={m}
              value={formatDerived(m, valueOf(m, t))}
              higherIsBetter={betterHigher(m)}
              channel={campaign.channel}
              deltaPercent={deltaOf(daily)}
              sparkline={sampleOf(daily)}
            />
          );
        })}
      </div>

      <Chart
        channel={campaign.channel}
        metric={chartMetric}
        onMetricChange={setChartMetric}
        data={creativeSeries(id, chartMetric, range)}
        title={`${chartMetric} over time`}
      />

      <p className="gr-type-caption gr-campaign__note">
        Figures are this ad&rsquo;s share of the campaign, {Math.round(creativeShare(id) * 100)}% of
        {' '}{formatMetric('Spend', creativeTotals(id, range).spend / (creativeShare(id) || 1))} spend,
        and follow the date range.
      </p>
    </>
  );
}
