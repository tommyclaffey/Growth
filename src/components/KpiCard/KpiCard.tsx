import './KpiCard.css';
import { DeltaBadge } from '../DeltaBadge/DeltaBadge';

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
  /** Relative heights 0-1, oldest first. Seven points in the Figma spec. */
  sparkline?: number[];
  loading?: boolean;
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
  loading = false,
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
    <button type="button" className="gr-kpi" onClick={onClick}>
      <span className="gr-kpi__label gr-type-label-field">{label}</span>
      <span className="gr-kpi__value gr-type-kpi-value">{value}</span>

      <span className="gr-kpi__foot">
        {deltaPercent !== undefined && (
          <DeltaBadge percent={deltaPercent} higherIsBetter={higherIsBetter} />
        )}

        {progress !== undefined ? (
          <span
            className="gr-kpi__progress"
            role="img"
            aria-label={`${Math.round(progress * 100)} percent of target`}
          >
            <span
              className="gr-kpi__progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </span>
        ) : sparkline && sparkline.length > 0 ? (
          <span className="gr-kpi__spark" aria-hidden="true">
            {sparkline.map((h, i) => (
              <span
                key={i}
                className="gr-kpi__spark-bar"
                style={{ height: `${Math.max(0.15, h) * 14}px` }}
              />
            ))}
          </span>
        ) : null}
      </span>
    </button>
  );
}
