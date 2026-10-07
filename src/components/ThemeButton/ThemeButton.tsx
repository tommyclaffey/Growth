import { Button } from '../Button/Button';

export type Theme = 'light' | 'dark';

/**
 * Light / dark in one press -- the Figma "Theme toggle", 36 x 36.
 *
 * The icon is where you would GO: a moon in light mode, a sun in dark. Lives
 * beside the Growth logo (Tommy, Oct 7: the top bar was the wrong place --
 * it sat among the controls for the data, and this is not about the data).
 * On a phone the sidebar is hidden, so the same switch is a row in More.
 */
export function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const toDark = theme === 'light';
  return (
    <Button
      variant="ghost"
      className="gr-button--square gr-theme-button"
      icon={toDark ? <IconMoon /> : <IconSun />}
      aria-label={toDark ? 'Switch to dark mode' : 'Switch to light mode'}
      title={toDark ? 'Dark mode' : 'Light mode'}
      onClick={onToggle}
    />
  );
}

export function IconMoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  );
}

export function IconSun() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
