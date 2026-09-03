import './KpiCard.css';
import { DeltaBadge } from '../DeltaBadge/DeltaBadge';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import { Sparkline } from '../Sparkline/Sparkline';
import type { Metric } from '../../data/metrics';
import type { ChannelName } from '../../styles/tokens';

export interface KpiCardProps {
  label: string;
  value: string;
  /** e.g. 8 for +8%. Sign drives the arrow. */
  deltaPercent?: number;
  /**
   * Whether a rise is good news. False for cost metrics like CAC, where a
   * falling number is the win — colouring by direction alone paints an
   * improving CAC red.
   */
  higherIsBetter?: boolean;
  /** 0-1. Renders the pace-to-target bar instead of a sparkline. */
  progress?: number;
  /** Raw values, oldest first. Seven points in the Figma spec. */
  sparkline?: number[];
  /** Passed through so the mark follows the same rule the chart does. */
  metric?: Metric;
  channel?: ChannelName | 'all';
  loading?: boolean;
  /** Renders the error state: an em dash, and the badge and sparkline in semantic/bad. */
  error?: boolean;
  /** Fires from the Discuss button, not the whole card. */
  onDiscuss?: () => void;
  onClick?: () => void;
}

/**
 * KPI card — 233x122, radius/xl.
 *
 * The card IS clickable. Hover state and the arrow on "Pace to target" both
 * imply navigation, so it needs keyboard activation and a focus ring. That sat
 * as an open question in the Figma file for weeks; ambiguity is the thing
 * engineers hate most, so it is resolved here as a real button.
 *
 * Progress and sparkline are mutually exclusive by design. "Pace to target"
 * used to be a DETACHED frame while its four siblings were instances, which is
 * exactly how it drifted. One component now, with a Progress boolean.
 */
export function KpiCard({
  label,
  value,
  deltaPercent,
  higherIsBetter = true,
  progress,
  sparkline,
  metric,
  channel,
  loading = false,
  error = false,
  onDiscuss,
  onClick,
}: KpiCardProps) {
  if (loading) {
    return (
      <div className="gr-kpi gr-kpi--loading" aria-busy="true" aria-label={`${label} loading`}>
        <div className="gr-kpi__skeleton gr-kpi__skeleton--label" />
        <div className="gr-kpi__skeleton gr-kpi__skeleton--value" />
        <div className="gr-kpi__skeleton gr-kpi__skeleton--foot" />
      </div>
    );
  }

  return (
    <div className={`gr-kpi ${error ? 'is-error' : ''}`} onClick={onClick}>
      <span className="gr-kpi__label gr-type-label-field">{label}</span>
      <span className="gr-kpi__value gr-type-kpi-value">{error ? '—' : value}</span>

      {/* Discuss — 24x24, top right, revealed on hover or keyboard focus.
          This is the card's actual affordance for starting a conversation
          about a number; the whole card being clickable was my approximation
          of it. Kept in the tab order so it is reachable without a mouse. */}
      {onDiscuss && (
        <button
          type="button"
          className="gr-kpi__discuss"
          aria-label={`Discuss ${label}`}
          onClick={(e) => { e.stopPropagation(); onDiscuss(); }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
               stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.4 8c0 .9-.7 1.6-1.6 1.6H5.6L3 11.6V9.6h.6C2.7 9.6 2 8.9 2 8V3.6C2 2.7 2.7 2 3.6 2h7.2c.9 0 1.6.7 1.6 1.6V8Z" />
            <path d="M5 5h4.8M5 7h3" />
          </svg>
        </button>
      )}

      <span className="gr-kpi__foot">
        {deltaPercent !== undefined && (
          <DeltaBadge percent={deltaPercent} higherIsBetter={higherIsBetter} />
        )}

        {progress !== undefined ? (
          <ProgressBar value={progress} label={label} />
        ) : sparkline && sparkline.length > 0 ? (
          <Sparkline values={sparkline} metric={metric} channel={channel} />
        ) : null}
      </span>
    </div>
  );
}
