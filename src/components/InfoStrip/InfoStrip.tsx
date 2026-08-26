import './InfoStrip.css';

export interface Alert { id: string; label: string; tone?: 'warn' | 'bad' | 'good'; }

export interface InfoStripProps {
  title?: string;
  alerts: Alert[];
  onAlertClick?: (id: string) => void;
}

/**
 * Needs-attention strip — 1220x50, radius/lg, 12/16 padding.
 *
 * The pills are the only route to Reallocate budget. That screen had ten ways
 * out and zero ways in until these were wired, which is the kind of thing a
 * prototype audit catches and a design review does not.
 */
export function InfoStrip({ title = 'Needs attention', alerts, onAlertClick }: InfoStripProps) {
  return (
    <div className="gr-strip">
      <span className="gr-strip__dot" aria-hidden="true" />
      <span className="gr-strip__title gr-type-strip">{title}</span>
      <span className="gr-strip__badge gr-type-caption-med">{alerts.length}</span>
      <span className="gr-strip__spacer" />
      {alerts.map((a) => (
        <button
          key={a.id}
          type="button"
          className={`gr-strip__pill gr-type-caption-med tone-${a.tone ?? 'warn'}`}
          onClick={() => onAlertClick?.(a.id)}
        >
          <span className="gr-strip__pip" aria-hidden="true" />
          {a.label}
        </button>
      ))}
    </div>
  );
}
