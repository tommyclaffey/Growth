import type { ReactElement, ReactNode } from 'react';
import './Sidebar.css';
import { Avatar } from '../Avatar/Avatar';
import { ME, ME_ROLE } from '../../data/chat';
import { useAvatarFor, useWorkspaceName } from '../../data/profile';

export type NavKey = 'overview' | 'channels' | 'campaigns' | 'ads' | 'decisions' | 'reports' | 'notifications' | 'settings';

export interface SidebarProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  /** Waiting items, shown as a count on the item. Zero or absent = no badge. */
  counts?: Partial<Record<NavKey, number>>;
}

type Item = { key: NavKey; label: string; icon: ReactElement };
const NAV: Item[] = [
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


/**
 * Sidebar — 232 wide, full height, surface/card.
 *
 * Nav item is 204x36 with 8/12 padding and a 10px gap, radius/md.
 * Active state is accent/tint background with accent/text label.
 *
 * Focus is a BOOLEAN on Nav item, not a State variant. Focus is orthogonal to
 * selection — an item can be active AND focused — and modelling it as a State
 * would take Nav item from 28 variants to 56 for zero added expressiveness.
 */
export function Sidebar({ active, onNavigate, counts = {} }: SidebarProps) {
  const avatarFor = useAvatarFor();
  /* Read once at the top rather than inline in the JSX -- a hook call buried in
     an attribute is a hook whose ordering nobody can check at a glance. */
  const workspace = useWorkspaceName();
  return (
    <nav className="gr-sidebar" aria-label="Main">
      <div className="gr-sidebar__logo">
        <span className="gr-sidebar__mark" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 14 14">
            <path d="M1 10L5 6L8 9L13 3" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        {/* The PRODUCT, then the workspace. Two facts, stacked, not one
            substituted for the other.

            The wordmark used to render the workspace name, so this lockup read
            the CUSTOMER's company beside Growth's own trend-arrow mark -- the
            product wearing someone else's name. It only became visible when the
            demo workspace stopped being called "Growth"; the bug was there the
            whole time, waiting for a value that was not the product's own. It came from Settings promising
            the workspace was "shown in the sidebar", which was made true in the
            only slot available rather than by adding one.

            Every product with workspaces does it this way: the app is the app,
            and the account you are inside it is a line under it. */}
        <span className="gr-sidebar__brand-text">
          <span className="gr-sidebar__wordmark gr-type-brand">GROWTH</span>
          <span className="gr-sidebar__workspace gr-type-caption">{workspace}</span>
        </span>
      </div>

      {/* ONE list, Settings included (Tommy, Sept 30): Analyze / Act sections
          and Settings at the foot were tried and reverted -- "too cluttered,
          I liked the layout better before." The counts stayed. */}
      <ul className="gr-sidebar__list">
        {NAV.map((item) => (
          <li key={item.key}><NavButton item={item} active={active} count={counts[item.key]} onNavigate={onNavigate} /></li>
        ))}
      </ul>

      <div className="gr-sidebar__spacer" />

      {/* Goes to Settings. It was a button with no handler — the same dead
          control as a switch that flips nothing. */}
      <button
        type="button"
        className={`gr-navitem gr-navitem--account gr-type-label-button ${active === 'settings' ? 'is-active' : ''}`}
        onClick={() => onNavigate('settings')}
      >
        {/* The real avatar component rather than a gradient circle standing in
            for one — same initials and hue she carries in the chat panel, so
            she is recognisably the same person in both places. */}
        <Avatar initials={ME.initials} hue={ME.hue} size={28} src={avatarFor(ME)} name={ME.name} />
        <span className="gr-navitem__account">
          <span className="gr-navitem__name">{ME.name}</span>
          <span className="gr-navitem__role gr-type-micro">{ME_ROLE}</span>
        </span>
      </button>
    </nav>
  );
}

function NavButton({ item, active, count, onNavigate }: {
  item: Item; active: NavKey; count?: number; onNavigate: (key: NavKey) => void;
}) {
  const on = active === item.key;
  return (
    <button
      type="button"
      className={`gr-navitem gr-type-label-button ${on ? 'is-active' : ''}`}
      aria-current={on ? 'page' : undefined}
      /* Spoken "Decisions, 4 waiting" -- explicit, because a visible count
         beside the label otherwise reads as "Decisions4". */
      aria-label={count ? `${item.label}, ${count} waiting` : undefined}
      onClick={() => onNavigate(item.key)}
    >
      <span className="gr-navitem__icon" aria-hidden="true">{item.icon}</span>
      {item.label}
      {/* What is waiting there -- the same number the screen shows. Nothing at
          zero: a "0" badge is one more thing to read that says nothing. */}
      {count !== undefined && count > 0 && (
        <span className="gr-navitem__count gr-type-caption-med" aria-hidden="true">{count}</span>
      )}
    </button>
  );
}

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
