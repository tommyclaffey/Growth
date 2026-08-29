import './ProgressBar.css';

export interface ProgressBarProps {
  /** 0–1. Clamped, because a target can be exceeded and the bar cannot. */
  value: number;
  label?: string;
}

/**
 * Progress bar — 8px tall, radius/pill, accent/tint track with an
 * accent gradient fill.
 *
 * Extracted from KpiCard, which was drawing its own bar rather than using
 * this. That is the exact defect the Aug 19 Figma audit found — "Chart and
 * KPI card duplicate components instead of instancing them" — and the code
 * had reproduced it. Two copies of one thing is how the two disagreeing
 * Buttons started.
 */
export function ProgressBar({ value, label }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span
      className="gr-progress"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className="gr-progress__fill" style={{ width: `${pct}%` }} />
    </span>
  );
}
