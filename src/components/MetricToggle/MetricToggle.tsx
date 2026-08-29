import './MetricToggle.css';
import { METRICS, type Metric } from '../../data/metrics';

export interface MetricToggleProps {
  value: Metric;
  onChange: (m: Metric) => void;
  /** Narrow the set, e.g. a screen that only reports on money. */
  options?: Metric[];
}

/**
 * Metric toggle — 32px segmented control, 4px padding, 24px segments.
 *
 * Extracted from Chart, which had it inline. In Figma this component had
 * zero instances for the same reason: Chart embedded a copy instead of
 * instancing it, so the two could drift apart without anyone noticing.
 *
 * Uses role="tablist" rather than radio inputs because the segments switch a
 * view rather than submit a value.
 */
export function MetricToggle({ value, onChange, options = METRICS }: MetricToggleProps) {
  return (
    <div className="gr-metrictoggle" role="tablist" aria-label="Metric">
      {options.map((m) => (
        <button
          key={m}
          role="tab"
          type="button"
          aria-selected={m === value}
          className={`gr-metrictoggle__seg gr-type-label-button ${m === value ? 'is-active' : ''}`}
          onClick={() => onChange(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
