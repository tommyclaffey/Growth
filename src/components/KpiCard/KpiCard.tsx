import './KpiCard.css';

export interface KpiCardProps {
  label: string;
  value: string;
  /** e.g. 8 for +8%. Sign drives the arrow and the colour. */
  deltaPercent?: number;
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

  const up = (deltaPercent ?? 0) >= 0;

  return (
    <button type="button" className="gr-kpi" onClick={onClick}>
      <span className="gr-kpi__label gr-type-label-field">{label}</span>
      <span className="gr-kpi__value gr-type-kpi-value">{value}</span>

      <span className="gr-kpi__foot">
        {deltaPercent !== undefined && (
          <span className={`gr-kpi__badge gr-type-caption-med ${up ? 'is-up' : 'is-down'}`}>
            <span aria-hidden="true">{up ? '↑' : '↓'}</span>
            {Math.abs(deltaPercent)}%
            <span className="gr-sr-only">{up ? 'increase' : 'decrease'}</span>
          </span>
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
