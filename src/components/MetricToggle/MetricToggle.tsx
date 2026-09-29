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
  /* ⌨️ The ARIA tabs pattern: ONE Tab stop for the whole set, arrows to move.
     role="tab" promises that to a screen reader, and every segment was its own
     Tab stop with no arrow keys -- six stops to get past a toggle, and the
     announced keyboard model did not work. Arrow selects as it moves (automatic
     activation): switching metric is instant and cheap, so there is nothing to
     confirm. Home/End jump to the ends. */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const i = options.indexOf(value);
    const next = e.key === 'ArrowRight' ? (i + 1) % options.length
      : e.key === 'ArrowLeft' ? (i - 1 + options.length) % options.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? options.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(options[next]);
    const tabs = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    /* Focus follows after React commits the new selection. */
    requestAnimationFrame(() => tabs[next]?.focus());
  }

  return (
    <div className="gr-metrictoggle" role="tablist" aria-label="Metric" onKeyDown={onKeyDown}>
      {options.map((m) => (
        <button
          key={m}
          role="tab"
          type="button"
          aria-selected={m === value}
          tabIndex={m === value ? 0 : -1}
          className={`gr-metrictoggle__seg gr-type-label-button ${m === value ? 'is-active' : ''}`}
          onClick={() => onChange(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
