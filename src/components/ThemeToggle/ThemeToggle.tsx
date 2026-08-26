import './ThemeToggle.css';

export interface ThemeToggleProps {
  theme: 'light' | 'dark';
  onToggle: () => void;
}

/**
 * Theme toggle — 36x36, icon frame 16x16 centred, stroke 1.4.
 *
 * The two glyphs are the Figma file's own vectors, transcribed path-for-path
 * rather than substituted with lookalikes. The previous version used the
 * Unicode characters U+263E and U+2600, which render as whatever glyph the
 * user's font happens to ship — different weight, different optical size, and
 * on some systems a colour emoji. An icon that changes shape depending on the
 * machine is not a design system component.
 *
 * Light mode shows the MOON, because the control states its destination, not
 * its current value. Same convention as the Figma variants.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const goingDark = theme === 'light';
  return (
    <button
      type="button"
      className="gr-theme-toggle"
      onClick={onToggle}
      aria-label={goingDark ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={!goingDark}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
           fill="none" stroke="currentColor" strokeWidth="1.4"
           strokeLinecap="round" strokeLinejoin="round">
        {goingDark ? (
          /* Mode=Light — crescent. Vector sits at (2,3) in the 16x16 frame. */
          <g transform="translate(2,3)">
            <path d="M 11.03 6.8 C 10.09 7.04 9.10 7.03 8.17 6.77 C 7.24 6.51 6.39 6.02 5.70 5.33 C 5.01 4.64 4.52 3.79 4.26 2.86 C 4.00 1.92 3.99 0.94 4.23 0 C 3.27 0.24 2.39 0.73 1.68 1.43 C 0.98 2.12 0.46 2.99 0.20 3.94 C -0.06 4.90 -0.07 5.90 0.19 6.86 C 0.44 7.82 0.94 8.69 1.64 9.39 C 2.34 10.09 3.21 10.59 4.17 10.84 C 5.13 11.10 6.13 11.09 7.09 10.83 C 8.04 10.57 8.91 10.05 9.60 9.35 C 10.30 8.64 10.79 7.76 11.03 6.8 Z" />
          </g>
        ) : (
          /* Mode=Dark — sun. Disc at (5,5), rays at (1,1). */
          <>
            <g transform="translate(5,5)">
              <path d="M 6.2 3.1 C 6.2 4.81 4.81 6.2 3.1 6.2 C 1.39 6.2 0 4.81 0 3.1 C 0 1.39 1.39 0 3.1 0 C 4.81 0 6.2 1.39 6.2 3.1 Z" />
            </g>
            <g transform="translate(1,1)">
              <path d="M 6.6 0 L 6.6 1.5 M 6.6 11.7 L 6.6 13.2 M 13.2 6.6 L 11.7 6.6 M 1.5 6.6 L 0 6.6 M 11.3 1.9 L 10.2 3 M 3 10.2 L 1.9 11.3 M 11.3 11.3 L 10.2 10.2 M 3 3 L 1.9 1.9" />
            </g>
          </>
        )}
      </svg>
    </button>
  );
}
