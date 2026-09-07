import './InfoStrip.css';

export interface Alert { id: string; label: string; tone?: 'warn' | 'bad' | 'good'; }

export interface InfoStripProps {
  title?: string;
  alerts: Alert[];
  onAlertClick?: (id: string) => void;
  /** Marks one alert as addressed and removes it from the strip. */
  onDismiss?: (id: string) => void;
  /** Clears every alert currently shown. */
  onDismissAll?: () => void;
}

/**
 * Needs-attention strip — 1220x50, radius/lg, 12/16 padding.
 *
 * The pills are the only route to Reallocate budget. That screen had ten ways
 * out and zero ways in until these were wired, which is the kind of thing a
 * prototype audit catches and a design review does not.
 */
export function InfoStrip({
  title = 'Needs attention', alerts, onAlertClick, onDismiss, onDismissAll,
}: InfoStripProps) {
  /* Nothing needing attention is not a strip saying "0". The caller decides
     whether to render this at all, but guarding here too means no arrangement
     of props can produce an empty attention bar. */
  if (alerts.length === 0) return null;

  return (
    <div className="gr-strip">
      <div className="gr-strip__lead">
        <span className="gr-strip__dot" aria-hidden="true" />
        <span className="gr-strip__title gr-type-strip">{title}</span>
        <span className="gr-strip__badge gr-type-caption-med">{alerts.length}</span>
      </div>

      {/* Pills live in their own wrapping group. As a flat row they could
          neither shrink nor wrap, so opening the chat panel pushed them off
          the edge of the card instead of reflowing. */}
      <div className="gr-strip__pills">
        {alerts.map((a) => (
          /* The pill is already a <button>, so dismiss has to be a SIBLING --
             a button inside a button is invalid HTML and browsers resolve it
             by dropping one, which is not a coin flip worth taking on the only
             control that removes the alert. The wrapper carries the border and
             surface; the two buttons inside it are transparent. */
          <span
            key={a.id}
            className={`gr-strip__pill-wrap gr-type-caption-med tone-${a.tone ?? 'warn'}`}
          >
            <button
              type="button"
              className="gr-strip__pill"
              onClick={() => onAlertClick?.(a.id)}
            >
              <span className="gr-strip__pip" aria-hidden="true" />
              {a.label}
            </button>
            {onDismiss && (
              <button
                type="button"
                className="gr-strip__dismiss"
                onClick={() => onDismiss(a.id)}
                /* Names the alert, not just the action. "Dismiss" three times
                   in a row tells a screen-reader user nothing about which one
                   they are about to clear. */
                aria-label={`Mark addressed and dismiss: ${a.label}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            )}
          </span>
        ))}

        {onDismissAll && alerts.length > 1 && (
          <button type="button" className="gr-strip__clear gr-type-caption-med"
                  onClick={onDismissAll}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
