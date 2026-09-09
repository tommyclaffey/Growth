import './InfoStrip.css';

export interface Alert {
  id: string;
  label: string;
  tone?: 'warn' | 'bad' | 'good';
  /**
   * Where this came from. `derived` means the data raised it; `assigned` means
   * a person did.
   *
   * ⚠️ Shown differently on purpose. "Your CAC rose 42%" and "you flagged this
   * on Tuesday" are not the same claim, and a strip that renders them
   * identically is asserting that they are. The assigned ones carry a mark and
   * say who put them there. */
  source?: 'derived' | 'assigned';
}

export interface InfoStripProps {
  title?: string;
  alerts: Alert[];
  onAlertClick?: (id: string) => void;
  /** Marks one alert as addressed and removes it from the strip. */
  onDismiss?: (id: string) => void;
  /** Clears every alert currently shown. */
  onDismissAll?: () => void;
  /** Restores the alert dismissed most recently. */
  onUndo?: () => void;
  /** What that undo would put back, for naming it in the control. */
  undoLabel?: string | null;
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
  onUndo, undoLabel,
}: InfoStripProps) {
  /* Nothing needing attention is not a strip saying "0" -- EXCEPT while an undo
     is still on offer. Clearing the last alert and having the strip vanish
     takes the undo with it, which is the moment it is most likely to be
     wanted. */
  if (alerts.length === 0 && !undoLabel) return null;

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
            className={`gr-strip__pill-wrap gr-type-caption-med tone-${a.tone ?? 'warn'} ${a.source === 'assigned' ? 'is-assigned' : ''}`}
            title={a.source === 'assigned' ? 'Flagged by you' : 'Raised by the data'}
          >
            <button
              type="button"
              className="gr-strip__pill"
              onClick={() => onAlertClick?.(a.id)}
            >
              <span className="gr-strip__pip" aria-hidden="true" />
              {a.source === 'assigned' && (
                <span className="gr-strip__flag" aria-label="Flagged by you">⚑</span>
              )}
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

        {/* ⭐ Undo, offered AT THE MOMENT OF THE MISTAKE.

            A bulk Restore in Settings is not an undo. It is somewhere you go
            once you have already realised, found the setting, and decided it
            was worth the trip. This sits where the action happened and names
            what it puts back, so it can be used without thinking. */}
        {onUndo && undoLabel && (
          <button type="button" className="gr-strip__undo gr-type-caption-med"
                  onClick={onUndo}>
            Undo &ldquo;{undoLabel}&rdquo;
          </button>
        )}
      </div>
    </div>
  );
}
