import './Button.css';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Trailing caret, used where the button opens a menu. */
  caret?: boolean;
  children: ReactNode;
}

/**
 * Button — the only button in Growth.
 *
 * Merged from two divergent components in Figma. The originals disagreed on
 * height (38 vs 36), padding, gap and label weight, and neither sat on the
 * 4px grid. Merging them surfaced 78 instances across 15 screens that needed
 * migrating, which is the part of design systems work nobody puts in a portfolio.
 *
 * Height is 36 = 8 + 20 + 8. The label is 13/20 rather than 13/18 precisely so
 * that sum lands on the grid: 18 + 2x8 = 34 and 18 + 2x10 = 38, and 9 is not
 * in the spacing scale. The control sits on a 4px grid; body copy keeps its
 * own 18px rhythm.
 *
 * Focus is modelled as a State here rather than a boolean because a button's
 * states map to CSS pseudo-classes, which is what an engineer expects.
 * Elsewhere in the system focus is a boolean, because focus is orthogonal to
 * selection. That inconsistency is documented, not hidden.
 */
export function Button({
  variant = 'primary',
  caret = false,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={['gr-button', `gr-button--${variant}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      <span className="gr-button__label">{children}</span>
      {caret && (
        <svg className="gr-button__caret" width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
          <path d="M1 1L4 4L7 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
