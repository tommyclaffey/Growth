import './CreativeCard.css';
import { StatusPill } from '../StatusPill/StatusPill';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { formatMetric } from '../../data/metrics';
import type { Creative } from '../../data/creative';
import type { ChannelName } from '../../styles/tokens';

export interface CreativeCardProps {
  creative: Creative;
  channel: ChannelName;
  /** Marks the best performer on the current sort. */
  rank?: number;
}

function duration(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/**
 * One ad: the asset, then what it did.
 *
 * Was a horizontal row -- thumbnail left, everything else right. That layout
 * makes the artwork a bullet point beside the text, and the artwork is the
 * thing being judged. Vertical puts the ad at the size you can actually assess
 * it and files the numbers underneath, which is the order the question is
 * asked in: is this ad any good, and did it work.
 *
 * The frame carries the REAL aspect ratio, so a 9:16 story is tall and a 16:9
 * pre-roll is wide, on the same row. Normalising them to one shape would hide
 * the crop problem this section exists to show.
 *
 * TYPE HIERARCHY -- four steps, and every one is an existing style:
 *
 *   h4  headline  gr-type-strip        600 13/18   the ad's hook
 *       body      gr-type-body         400 13/18   a sentence, so it reads as one
 *       meta      gr-type-caption      400 12/16   supporting detail
 *       stat dt   gr-type-overline     500 11/15   a column label, like the tables
 *       stat dd   gr-type-body-medium  500 13/18   the figure
 *
 * The headline and the copy share a SIZE and differ by weight, 600 against 400.
 * They previously differed by one pixel -- 13 against 12 -- which is not a
 * hierarchy, it is a rounding error, and the copy was wearing a caption style
 * that exists for labels rather than for sentences.
 *
 * ⚠️ `gr-type-strip` is the system's small-heading step, named after the
 * InfoStrip because that was its first consumer. type.css is generated from
 * Figma and must not be hand-edited, so the name stays -- but the FIGMA style
 * is what needs renaming: Heading/Strip describes where it was used, not what
 * it is. Logged rather than worked around with a fourth 13px weight.
 */
export function CreativeCard({ creative: c, channel, rank }: CreativeCardProps) {
  const visual = c.kind === 'image' || c.kind === 'video';
  const cac = c.leads > 0 ? formatMetric('CAC', c.spend / c.leads) : '—';

  return (
    <article className={`gr-creative gr-creative--${c.kind} ${c.stage === 'Paused' ? 'is-paused' : ''}`}>
      <div
        className="gr-creative__stage"
        /* The ratio drives the frame rather than a fixed height per kind, so
           adding a format needs no new CSS rule to go with it. */
        style={visual && c.ratio ? { aspectRatio: c.ratio.replace(':', ' / ') } : undefined}
      >
        {visual && c.src ? (
          <img className="gr-creative__img" src={c.src}
               style={{ objectPosition: c.focus }} alt="" loading="lazy" />
        ) : visual ? (
          /* No file for this shape yet. Says so, rather than borrowing an
             asset of a different shape and implying one was uploaded. */
          <span className="gr-creative__empty">
            <ChannelMark channel={channel} size={22} />
            <span className="gr-type-micro">
              {c.kind === 'video' ? 'No poster frame' : 'No asset'}
            </span>
          </span>
        ) : c.kind === 'audio' ? (
          <span className="gr-creative__wave" aria-hidden="true">
            {[6, 13, 9, 17, 11, 20, 8, 15, 10, 18, 7, 12, 16, 9, 14].map((h, i) => (
              <i key={i} style={{ height: `${h}px` }} />
            ))}
          </span>
        ) : (
          /* A search ad IS text, so it renders as a search result rather than
             as an icon standing in for one. */
          <span className="gr-creative__serp">
            <span className="gr-creative__serp-url gr-type-micro">{c.destination}</span>
            <span className="gr-creative__serp-head gr-type-strip">{c.headline}</span>
          </span>
        )}

        {rank !== undefined && (
          <span className="gr-creative__rank gr-type-micro" aria-hidden="true">#{rank}</span>
        )}
        {c.ratio && <span className="gr-creative__ratio gr-type-micro">{c.ratio}</span>}
        {c.seconds && (
          <span className="gr-creative__time gr-type-micro">{duration(c.seconds)}</span>
        )}
      </div>

      <div className="gr-creative__body">
        <header className="gr-creative__head">
          <h4 className="gr-creative__headline gr-type-strip">{c.headline}</h4>
          <StatusPill stage={c.stage} />
        </header>
        <p className="gr-creative__copy gr-type-body">{c.body}</p>
        <p className="gr-creative__meta gr-type-caption">
          {c.adSetName}{c.cta ? ` · ${c.cta}` : ''}
        </p>
      </div>

      {/* Below the ad, not beside it. Three figures on one baseline read as a
          comparison across cards; the same three in a sentence do not. */}
      <dl className="gr-creative__stats">
        {/* Overline, the same style the table column headers wear. These are
            column labels for figures, and labelling them differently from the
            tables two sections down would be two answers to one question. */}
        <div><dt className="gr-type-overline">Spend</dt>
          <dd className="gr-type-body-medium">{formatMetric('Spend', c.spend)}</dd></div>
        <div><dt className="gr-type-overline">Leads</dt>
          <dd className="gr-type-body-medium">{c.leads.toLocaleString()}</dd></div>
        <div><dt className="gr-type-overline">CAC</dt>
          <dd className="gr-type-body-medium">{cac}</dd></div>
      </dl>
    </article>
  );
}
