import { useState } from 'react';
import './screens.css';
import { ChannelMark } from '../components/ChannelMark/ChannelMark';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { DeltaBadge } from '../components/DeltaBadge/DeltaBadge';
import { Chip } from '../components/Chip/Chip';
import { RANK_METRICS, rankedAds, type RankMode } from '../data/adRanking';
import { betterHigher, formatDerived, type DerivedMetric } from '../data/channelMetrics';
import { groupNoun, leafNoun } from '../data/channelDepth';
import { CHANNEL_LABEL, type Range } from '../data/metrics';
import { useChannels } from '../data/channels';

export interface AdsProps {
  range: Range;
  onOpenAd?: (id: string) => void;
}

/**
 * Every ad in the account, ranked — the micro end of the macro view.
 *
 * The one question the product could not answer: *"which of my ~40 ads is
 * winning, across everything?"* Ranking existed only inside a single campaign, so
 * the comparison stopped at the campaign boundary — which is the boundary a
 * marketer most wants to see across.
 *
 * ⭐ A TABLE, not the card grid that already exists inside a campaign. Ranking is
 * a comparison task: forty items, read down one column, judged against each
 * other. The card grid is for ASSESSING an ad — the artwork at a size you can
 * look at — and it is the right form one level down, where there are three or
 * four of them. Using cards here would make the reader scroll past the artwork
 * to compare numbers that belong in a column.
 */
export function Ads({ range, onOpenAd }: AdsProps) {
  const [metric, setMetric] = useState<DerivedMetric>('CAC');
  /* Relative by default, and that is the whole argument of this screen. See
     adRanking.ts: an absolute cross-channel CAC sort just re-derives the channel
     ranking, because podcasts cost ~$129 a lead and Meta ~$36. */
  const [mode, setMode] = useState<RankMode>('relative');

  /* Subscribed, so switching a channel off in Settings empties it from here too
     -- the rule the whole app follows: a channel you do not run is gone, not
     greyed out. */
  const channels = useChannels();
  const rows = rankedAds(metric, mode, range, channels);

  return (
    <section className="gr-card">
      <header className="gr-card__header">
        <h3 className="gr-card__title gr-type-card-heading">All ads</h3>
        <span className="gr-type-caption">{rows.length}</span>

        <div className="gr-ads__controls">
          {/* Rank mode. Two words rather than a segmented control, because the
              two options are not symmetrical -- one is the default reading and
              the other is a secondary question. */}
          <Chip label="vs its channel" pressed={mode === 'relative'}
                onClick={() => setMode('relative')} />
          <Chip label="Raw value" pressed={mode === 'absolute'}
                onClick={() => setMode('absolute')} />

          <label className="gr-ads__metric">
            <span className="gr-sr-only">Rank by metric</span>
            <select
              className="gr-ads__select gr-type-label-button"
              value={metric}
              onChange={(e) => setMetric(e.target.value as DerivedMetric)}
            >
              {/* Only metrics EVERY channel reports, so the ranking never
                  silently drops a channel. A CTR ranking would exclude podcasts
                  and affiliates and still call itself "all ads". */}
              {RANK_METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
      </header>

      {mode === 'relative' && (
        <p className="gr-type-caption gr-ads__lede">
          Ranked by how far each ad beats the average ad on its own channel — so a
          podcast spot can out-rank a Meta ad even though Meta&rsquo;s {metric} is better.
          Comparing them raw would only repeat what the channel table already says.
        </p>
      )}

      <table className="gr-table">
        <thead>
          <tr className="gr-type-overline">
            <th scope="col" className="gr-ads__rank">#</th>
            <th scope="col">Ad</th>
            <th scope="col">Channel</th>
            <th scope="col">Campaign</th>
            <th scope="col">{metric}</th>
            <th scope="col">vs its channel</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="gr-table__empty gr-type-body">
                No channels are switched on. Turn one back on in Settings to see ads here.
              </td>
            </tr>
          )}

          {rows.map((r, i) => (
            <tr key={r.creative.id} className="gr-campaign__adset-row">
              <td className="gr-type-caption gr-ads__rank">{i + 1}</td>
              <td className="gr-type-body-medium">
                <button
                  type="button"
                  className="gr-unbutton gr-campaign__adset-open"
                  onClick={() => onOpenAd?.(r.creative.id)}
                >
                  {r.creative.headline}
                </button>
                {/* The platform's own noun for the leaf tier -- a podcast has
                    Spots, paid search has Text ads. */}
                <span className="gr-ads__kind gr-type-caption">
                  {leafNoun(r.channel).one}
                  {r.creative.ratio ? ` · ${r.creative.ratio}` : ''}
                </span>
              </td>
              <td>
                <span className="gr-ads__channel">
                  <ChannelMark channel={r.channel} size={16} />
                  <span className="gr-type-body">{CHANNEL_LABEL[r.channel]}</span>
                </span>
              </td>
              <td className="gr-type-caption">
                {r.campaign.name}
                <span className="gr-ads__kind gr-type-caption">
                  {groupNoun(r.channel).one}: {r.creative.adSetName}
                </span>
              </td>
              <td className="gr-type-body">{formatDerived(metric, r.value)}</td>
              <td>
                {r.benchmark ? (
                  <DeltaBadge
                    percent={r.benchmark.deltaPercent}
                    higherIsBetter={betterHigher(metric)}
                    variant="benchmark"
                  />
                ) : (
                  /* A channel running one ad has no peers. Saying so beats a 0%
                     that would read as "exactly average". */
                  <span className="gr-type-caption gr-ads__nopeer">
                    only {leafNoun(r.channel).one.toLowerCase()} on {CHANNEL_LABEL[r.channel]}
                  </span>
                )}
              </td>
              <td><StatusPill stage={r.creative.stage} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
