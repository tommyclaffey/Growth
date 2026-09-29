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
import type { Target } from '../data/decisions';

/* The format named on the tile when an ad has no artwork uploaded -- the true
   format, never "Text" on a video. */
const FORMAT: Record<string, string> = {
  image: 'Image', video: 'Video', text: 'Text', audio: 'Audio', link: 'Link',
};

export interface AdsProps {
  range: Range;
  onOpenAd?: (id: string) => void;
  /** Raises this ad with the decision agent. */
  onAskAbout?: (question: string, subject?: Target) => void;
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
export function Ads({ range, onOpenAd, onAskAbout }: AdsProps) {
  const [metric, setMetric] = useState<DerivedMetric>('CAC');
  /* Relative by default, and that is the whole argument of this screen. See
     adRanking.ts: an absolute cross-channel CAC sort just re-derives the channel
     ranking, because podcasts cost ~$129 a lead and Meta ~$36. */
  const [mode, setMode] = useState<RankMode>('relative');

  /* Subscribed, so switching a channel off in Settings empties it from here too
     -- the rule the whole app follows: a channel you do not run is gone, not
     greyed out. */
  const channels = useChannels();
  const all = rankedAds(metric, mode, range, channels);
  /* ⭐ Live ads only, by default. The top three "best" ads were all PAUSED --
     ranked on whole-period figures beside ads that are running, so #1 was an
     ad you could not act on without first switching it back on. Paused ads
     are one click away, and the Status column comes back with them. */
  const [showPaused, setShowPaused] = useState(false);
  const paused = all.filter((r) => r.creative.stage !== 'Active').length;
  const rows = showPaused ? all : all.filter((r) => r.creative.stage === 'Active');

  return (
    <section className="gr-card">
      <header className="gr-card__header">
        <h3 className="gr-card__title gr-type-card-heading">{showPaused ? 'All ads' : 'Live ads'}</h3>
        <span className="gr-dec__count gr-type-caption-med">{rows.length}</span>

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

          {paused > 0 && (
            <Chip label={`Show paused ${paused}`} pressed={showPaused}
                  onClick={() => setShowPaused(!showPaused)} />
          )}
        </div>
      </header>

      {/* One line, not three. The argument (why relative is the default) lives
          in adRanking.ts; the reader needs only what the order means. */}
      <p className="gr-type-caption gr-ads__lede">
        {mode === 'relative'
          ? `Ranked against the average ad on its own channel, so every channel gets a fair shot.`
          : `Ranked by raw ${metric} across every channel.`}
      </p>

      {/* Scrolls sideways only as a last resort. The text columns wrap first;
          this catches a window too narrow even for that, so the last column is
          reachable instead of sliced off by the card edge. */}
      <div className="gr-table-scroll">
      <table className="gr-table">
        <thead>
          <tr className="gr-type-overline">
            <th scope="col" className="gr-ads__rank">#</th>
            <th scope="col">Ad</th>
            <th scope="col">Channel</th>
            <th scope="col">Campaign</th>
            <th scope="col" className="gr-ads__num">{metric}</th>
            <th scope="col">vs its channel</th>
            {showPaused && <th scope="col">Status</th>}
            {onAskAbout && <th scope="col"><span className="gr-sr-only">Discuss</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6 + (showPaused ? 1 : 0) + (onAskAbout ? 1 : 0)} className="gr-table__empty gr-type-body">
                No channels are switched on. Turn one back on in Settings to see ads here.
              </td>
            </tr>
          )}

          {rows.map((r, i) => (
            <tr key={r.creative.id} className="gr-campaign__adset-row">
              <td className="gr-type-caption gr-ads__rank">{i + 1}</td>
              <td className="gr-type-body-medium gr-ads__wrap">
                <span className="gr-ads__ad">
                  {/* The ad itself, small. An ads table with no ads in it asked
                      the reader to remember what "Start free, no card" looked
                      like. Text, audio and link placements have no picture, so
                      they get a tile naming the format rather than a stock
                      image implying one. */}
                  {r.creative.src
                    ? <img className="gr-ads__thumb" src={r.creative.src} alt="" loading="lazy" />
                    : (
                      <span className="gr-ads__thumb gr-ads__thumb--none gr-type-micro" aria-hidden="true">
                        {FORMAT[r.creative.kind]}
                      </span>
                    )}
                  <span className="gr-ads__ad-text">
                    <button
                      type="button"
                      className="gr-unbutton gr-campaign__adset-open"
                      onClick={() => onOpenAd?.(r.creative.id)}
                    >
                      {r.creative.headline}
                    </button>
                    {/* The platform's own noun for the leaf tier -- a podcast
                        has Spots, paid search has Text ads. */}
                    <span className="gr-ads__kind gr-type-caption">
                      {leafNoun(r.channel).one}
                      {r.creative.ratio ? ` · ${r.creative.ratio}` : ''}
                    </span>
                  </span>
                </span>
              </td>
              <td>
                <span className="gr-ads__channel">
                  <ChannelMark channel={r.channel} size={16} />
                  <span className="gr-type-body">{CHANNEL_LABEL[r.channel]}</span>
                </span>
              </td>
              <td className="gr-type-caption gr-ads__wrap">
                {r.campaign.name}
                <span className="gr-ads__kind gr-type-caption">
                  {groupNoun(r.channel).one}: {r.creative.adSetName}
                </span>
              </td>
              <td className="gr-type-body-medium gr-ads__num">{formatDerived(metric, r.value)}</td>
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
              {showPaused && <td><StatusPill stage={r.creative.stage} /></td>}
              {onAskAbout && (
                <td className="gr-table__ask gr-type-caption-med">
                  <button type="button" className="gr-unbutton gr-ask"
                          aria-label={`Ask about ${r.creative.headline}`}
                          /* ⚠️ The ID travels, not just the headline. Ad
                              headlines are NOT unique -- the copy generator
                              cycles a fixed set of hooks, so "Start free, no
                              card" exists in several campaigns. Name matching
                              returned whichever matched first. */
                          onClick={() => onAskAbout(
                            `What's going on with “${r.creative.headline}”?`,
                            { kind: 'ad', id: r.creative.id, label: r.creative.headline })}>
                    Ask
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}
