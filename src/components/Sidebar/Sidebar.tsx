import './Sidebar.css';
import { Avatar } from '../Avatar/Avatar';
import { ME, ME_ROLE } from '../../data/chat';
import { useAvatarFor, useWorkspaceName } from '../../data/profile';

import { NAV, type Item, type NavKey } from './nav';
import { ThemeButton, type Theme } from '../ThemeButton/ThemeButton';
export type { NavKey } from './nav';

export interface SidebarProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  /** Waiting items, shown as a count on the item. Zero or absent = no badge. */
  counts?: Partial<Record<NavKey, number>>;
  /** Light / dark, switched from beside the logo. Absent = no button. */
  theme?: Theme;
  onToggleTheme?: () => void;
}




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
export function Sidebar({ active, onNavigate, counts = {}, theme, onToggleTheme }: SidebarProps) {
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
        {theme && onToggleTheme && <ThemeButton theme={theme} onToggle={onToggleTheme} />}
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
        <span className={`gr-navitem__count gr-type-caption-med ${item.key === 'decisions' ? 'is-accent' : ''}`}
              aria-hidden="true">{count}</span>
      )}
    </button>
  );
}

