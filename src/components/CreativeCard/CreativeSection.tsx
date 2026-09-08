import { useMemo, useState } from 'react';
import './CreativeCard.css';
import { CreativeCard } from './CreativeCard';
import { Chip } from '../Chip/Chip';
import {
  CREATIVE_NOUN, CREATIVE_SORTS, rankCreatives,
  type Creative, type CreativeKind, type CreativeSort,
} from '../../data/creative';
import type { ChannelName } from '../../styles/tokens';

const TOP_N = 3;

export interface CreativeSectionProps {
  channel: ChannelName;
  creatives: Creative[];
}

/**
 * Top ads first, everything else behind a disclosure.
 *
 * A campaign can run a dozen ads and three of them matter. Listing all twelve
 * at equal weight makes finding the three the reader's job. The rest are one
 * click away, not hidden -- and the button says how many, so the collapsed
 * state never implies the list is complete.
 *
 * ⚠️ Paused ads are EXCLUDED by default and the toggle says how many are
 * hidden. A paused ad in a performance ranking competes on numbers it stopped
 * earning; the honest default is to leave it out and say so, rather than
 * silently blending stopped ads into "top performers".
 */
export function CreativeSection({ channel, creatives }: CreativeSectionProps) {
  const [sort, setSort] = useState<CreativeSort>('Leads');
  const [format, setFormat] = useState<CreativeKind | null>(null);
  /* Hiding paused ads is the right default ONLY when there are running ads to
     show instead. A fully paused campaign has nothing else -- defaulting to
     hidden there lands the reader on "no ads match" for a campaign that
     plainly has ads, which reads as the page being broken rather than as the
     campaign being off. */
  const [showPaused, setShowPaused] = useState(
    () => creatives.every((c) => c.stage === 'Paused'),
  );
  const [expanded, setExpanded] = useState(false);

  const formats = useMemo(
    () => [...new Set(creatives.map((c) => c.kind))],
    [creatives],
  );
  const pausedCount = creatives.filter((c) => c.stage === 'Paused').length;

  const filtered = useMemo(() => rankCreatives(
    creatives.filter((c) => (showPaused || c.stage !== 'Paused')
      && (format === null || c.kind === format)),
    sort,
  ), [creatives, showPaused, format, sort]);

  const shown = expanded ? filtered : filtered.slice(0, TOP_N);
  const hidden = filtered.length - shown.length;

  return (
    <>
      <div className="gr-creative-controls">
        {/* Only offered when there is more than one format to choose between --
            a filter with a single option is a control that cannot change
            anything. */}
        {formats.length > 1 && formats.map((f) => (
          <Chip
            key={f}
            label={f[0].toUpperCase() + f.slice(1)}
            onClick={() => setFormat(format === f ? null : f)}
            removable={format === f}
            onRemove={() => setFormat(null)}
          />
        ))}

        <span className="gr-creative-controls__spacer" />

        {pausedCount > 0 && (
          <Chip
            label={showPaused ? `Hide ${pausedCount} paused` : `Show ${pausedCount} paused`}
            onClick={() => setShowPaused((v) => !v)}
          />
        )}

        {/* Sorting IS the definition of "top", so it sits beside the ranking
            rather than in a menu somewhere else.

            Chips, not a <select>. There is no <select> anywhere in this
            product, and adding the first one for a sort control would put a
            native OS widget next to a design system that has an answer for
            this already -- the campaign table filters with exactly these
            chips. A new control is a new thing to keep in sync. */}
        <span className="gr-type-caption gr-creative-controls__label">Top by</span>
        <fieldset className="gr-creative-controls__group">
          <legend className="gr-sr-only">Rank ads by</legend>
          {CREATIVE_SORTS.map((sKey) => (
            <Chip
              key={sKey}
              label={sKey}
              onClick={() => setSort(sKey)}
              /* The x on the active chip would offer to remove a sort that has
                 no unsorted state to fall back to, so it is deliberately not
                 removable -- pressed is shown, not dismissible. */
              pressed={sort === sKey}
            />
          ))}
        </fieldset>
      </div>

      {shown.length === 0 ? (
        /* Names the filter that emptied it. "No ads" alone would read as the
           campaign having none, which is a different and alarming fact. */
        <p className="gr-creative-empty gr-type-body">
          No {format ?? ''} ads match. {pausedCount > 0 && !showPaused
            ? `${pausedCount} paused ad${pausedCount === 1 ? '' : 's'} are hidden.`
            : 'Clear the filter to see the rest.'}
        </p>
      ) : (
        <div className="gr-creative-grid">
          {shown.map((c, i) => (
            <CreativeCard
              key={c.id}
              creative={c}
              channel={channel}
              /* Ranked only while the list is trimmed. Numbering all twelve
                 turns a shortlist into a leaderboard nobody asked for. */
              rank={!expanded && i < TOP_N ? i + 1 : undefined}
            />
          ))}
        </div>
      )}

      {(hidden > 0 || expanded) && (
        <button
          type="button"
          className="gr-creative-expand gr-type-body-medium"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? `Show top ${Math.min(TOP_N, filtered.length)}`
            : `See all ${filtered.length} ${CREATIVE_NOUN[channel].toLowerCase()}`}
          <span className="gr-creative-expand__caret" aria-hidden="true">⌄</span>
        </button>
      )}
    </>
  );
}
