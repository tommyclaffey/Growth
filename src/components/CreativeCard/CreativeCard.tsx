import './CreativeCard.css';
import { StatusPill } from '../StatusPill/StatusPill';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { formatMetric } from '../../data/metrics';
import type { Creative } from '../../data/creative';
import type { ChannelName } from '../../styles/tokens';

export interface CreativeCardProps {
  creative: Creative;
  channel: ChannelName;
}

function duration(s: number): string {
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

/**
 * One ad, rendered as the thing it actually is.
 *
 * A search ad is text, so it renders as text -- headline, display URL,
 * description, the shape a search result has. A podcast spot is audio, so it
 * renders as a duration and the read. Only the visual formats get a frame, and
 * that frame is labelled as a placeholder carrying the real ratio rather than
 * pretending to be a photograph nobody shot.
 */
export function CreativeCard({ creative: c, channel }: CreativeCardProps) {
  const visual = c.kind === 'image' || c.kind === 'video';

  return (
    <article className={`gr-creative gr-creative--${c.kind}`}>
      <div className="gr-creative__preview" data-ratio={c.ratio ?? ''}>
        {visual ? (
          /* One master asset, cropped to each placement's frame -- which is
             what the ad account does when it serves the same upload as 1:1 in
             feed and 9:16 in stories. object-fit: cover does the cropping;
             `focus` decides which band survives it. */
          <span className={`gr-creative__frame is-${c.ratio?.replace(':', '-')} ${c.src ? 'has-art' : ''}`}>
            {c.src ? (
              <img
                className="gr-creative__img"
                src={c.src}
                style={{ objectPosition: c.focus }}
                /* Empty alt, not a description. The headline and copy sit
                   beside it in real text -- narrating the artwork as well would
                   read the same ad twice to a screen-reader user. */
                alt=""
                loading="lazy"
                width={96}
                height={96}
              />
            ) : (
              <>
                <ChannelMark channel={channel} size={18} />
                <span className="gr-sr-only">Preview not available in this build</span>
              </>
            )}
            <span className="gr-creative__ratio gr-type-micro">{c.ratio}</span>
            {c.kind === 'video' && (
              <span className="gr-creative__play" aria-hidden="true">▶</span>
            )}
          </span>
        ) : c.kind === 'audio' ? (
          <span className="gr-creative__wave" aria-hidden="true">
            {/* Fixed heights, not random -- a waveform that reshuffles on every
                render reads as broken rather than alive. */}
            {[6, 13, 9, 17, 11, 20, 8, 15, 10, 18, 7, 12].map((h, i) => (
              <i key={i} style={{ height: `${h}px` }} />
            ))}
          </span>
        ) : (
          <span className="gr-creative__glyph gr-type-micro">
            {c.kind === 'text' ? 'Aa' : '↗'}
          </span>
        )}
      </div>

      <div className="gr-creative__body">
        <header className="gr-creative__head">
          <h4 className="gr-creative__headline gr-type-body-medium">{c.headline}</h4>
          <StatusPill stage={c.stage} />
        </header>

        {c.destination && (
          <p className="gr-creative__url gr-type-caption">{c.destination}</p>
        )}
        <p className="gr-creative__copy gr-type-caption">{c.body}</p>

        <p className="gr-creative__meta gr-type-micro">
          {c.adSetName}
          {c.seconds ? ` · ${duration(c.seconds)}` : ''}
          {c.cta ? ` · ${c.cta}` : ''}
        </p>

        {/* Spend and leads, so the section is not a mood board. Which asset is
            carrying the ad set is the only question anyone opens this to ask. */}
        <p className="gr-creative__stats gr-type-caption">
          <strong className="gr-type-body-medium">{formatMetric('Spend', c.spend)}</strong>
          {' · '}{c.leads.toLocaleString()} leads
          {' · '}{c.leads > 0 ? formatMetric('CAC', c.spend / c.leads) : '—'} CAC
        </p>
      </div>
    </article>
  );
}
