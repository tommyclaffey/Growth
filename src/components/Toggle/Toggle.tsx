import './Toggle.css';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  /** Hides the visible label but keeps it for screen readers. */
  labelHidden?: boolean;
  disabled?: boolean;
}

/**
 * Toggle — 44x24 visually, with a 44x44 tap target.
 *
 * The control is 24px on its short axis, which is under the 44px minimum
 * touch target. Rather than redraw it, the extra height is added as invisible
 * padding around the switch: it stays 44x24 to the eye and 44x44 to a finger.
 * That was the decision made in Figma on Aug 21, and this is where it becomes
 * real, because a Figma frame cannot express a hit area larger than itself.
 *
 * The whole thing is a real <button role="switch">, so it is keyboard
 * operable and announces its state without any extra wiring.
 */
export function Toggle({
  checked,
  onChange,
  label,
  labelHidden = false,
  disabled = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelHidden ? label : undefined}
      disabled={disabled}
      className={`gr-toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="gr-toggle__track" aria-hidden="true">
        <span className="gr-toggle__thumb" />
      </span>
      {!labelHidden && <span className="gr-toggle__label gr-type-body">{label}</span>}
    </button>
  );
}
