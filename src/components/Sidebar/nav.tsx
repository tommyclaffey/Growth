import type { ReactElement, ReactNode } from 'react';

/**
 * The navigation, once: the sidebar on desktop and the bottom tab bar on a
 * phone read the same items, labels and icons -- two copies of a nav list are
 * two lists that drift. Icons stay private; only the list and the More icon
 * leave this file.
 */
export type NavKey = 'overview' | 'channels' | 'campaigns' | 'ads' | 'decisions' | 'reports' | 'notifications' | 'settings';

export type Item = { key: NavKey; label: string; icon: ReactElement };

/* ⭐ ONE ICON SET, drawn to one grid (Sept 30).

   The originals were drawn one at a time, and side by side it showed: the
   Channels bars were three thin strokes (the lightest thing in the column),
   the Campaigns target a heavy double ring, the bell visibly smaller than its
   neighbours, Settings the only one with filled dots. Each fine alone; in a
   column the uneven ink is what read as unfinished.

   These follow Lucide's grid (ISC/MIT licence, lucide.dev): a 24-unit box, a
   2-unit stroke drawn at 18px -- so 1.5px on screen, the weight the rest of
   the product uses -- round caps and joins, outline only. Same concepts as
   before, so nothing has to be relearned. */
const Ic = ({ children }: { children: ReactNode }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
function IconGrid() {
  return <Ic><rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" /></Ic>;
}
function IconBars() {
  return <Ic><path d="M3 3v16a2 2 0 0 0 2 2h16" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></Ic>;
}
function IconTarget() {
  /* Two rings, not Lucide's three: at 18px the third made it the densest
     icon in the column -- the unevenness this set exists to remove. */
  return <Ic><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /></Ic>;
}
function IconCompass() {
  return <Ic><circle cx="12" cy="12" r="10" />
    <path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z" /></Ic>;
}
function IconFrame() {
  return <Ic><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></Ic>;
}
function IconDoc() {
  return <Ic><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></Ic>;
}
function IconBell() {
  return <Ic><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Ic>;
}
function IconSliders() {
  return <Ic><path d="M21 4h-7" /><path d="M10 4H3" /><path d="M21 12h-9" /><path d="M8 12H3" />
    <path d="M21 20h-5" /><path d="M12 20H3" /><path d="M14 2v4" /><path d="M8 10v4" /><path d="M16 18v4" /></Ic>;
}
function IconMore() {
  return <Ic><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></Ic>;
}
/** "More" on the phone tab bar -- the screens that do not get a tab of their own. */
// A data module that happens to hold JSX, not a component file: nothing here is hot-reloaded as a component.
// eslint-disable-next-line react-refresh/only-export-components
export const MORE_ICON: ReactElement = <IconMore />;

// eslint-disable-next-line react-refresh/only-export-components
export const NAV: Item[] = [
  { key: 'overview', label: 'Overview', icon: <IconGrid /> },
  { key: 'channels', label: 'Channels', icon: <IconBars /> },
  { key: 'campaigns', label: 'Campaigns', icon: <IconTarget /> },
  /* Directly under Campaigns, because it is the tier below them -- the nav
     order is the hierarchy, and Ads sitting after Reports would break that. */
  { key: 'ads', label: 'Ads', icon: <IconFrame /> },
  /* Directly after the hierarchy, before the reporting screens. It reads ACROSS
     everything above it, so it cannot sit inside any one of them. */
  { key: 'decisions', label: 'Decisions', icon: <IconCompass /> },
  { key: 'reports', label: 'Reports', icon: <IconDoc /> },
  { key: 'notifications', label: 'Notifications', icon: <IconBell /> },
  { key: 'settings', label: 'Settings', icon: <IconSliders /> },
];
