import './Chip.css';

export interface ChipProps {
  label: string;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

/** Chip — 24 tall, on the 4px grid. Default / hover / focus. */
export function Chip({ label, removable, onRemove, onClick }: ChipProps) {
  const interactive = Boolean(onClick);
  return (
    <span className={`gr-chip gr-type-caption-med ${interactive ? 'is-interactive' : ''}`}>
      {interactive ? (
        <button type="button" className="gr-chip__label" onClick={onClick}>{label}</button>
      ) : (
        <span className="gr-chip__label">{label}</span>
      )}
      {removable && (
        <button type="button" className="gr-chip__remove" onClick={onRemove} aria-label={`Remove ${label}`}>
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
            <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </span>
  );
}
