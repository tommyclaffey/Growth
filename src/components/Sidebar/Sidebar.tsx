import type { ReactElement } from 'react';
import './Sidebar.css';
import { Avatar } from '../Avatar/Avatar';
import { ME, ME_ROLE } from '../../data/chat';

export type NavKey = 'overview' | 'channels' | 'campaigns' | 'reports' | 'notifications' | 'settings';

export interface SidebarProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
}

const NAV: { key: NavKey; label: string; icon: ReactElement }[] = [
  { key: 'overview', label: 'Overview', icon: <IconGrid /> },
  { key: 'channels', label: 'Channels', icon: <IconBars /> },
  { key: 'campaigns', label: 'Campaigns', icon: <IconTarget /> },
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
export function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <nav className="gr-sidebar" aria-label="Main">
      <div className="gr-sidebar__logo">
        <span className="gr-sidebar__mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <path d="M1 10L5 6L8 9L13 3" fill="none" stroke="currentColor" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="gr-sidebar__wordmark gr-type-brand">GROWTH</span>
      </div>

      <ul className="gr-sidebar__list">
        {NAV.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className={`gr-navitem gr-type-label-button ${active === item.key ? 'is-active' : ''}`}
              aria-current={active === item.key ? 'page' : undefined}
              onClick={() => onNavigate(item.key)}
            >
              <span className="gr-navitem__icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          </li>
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
        <Avatar initials={ME.initials} hue={ME.hue} size={28} src={ME.avatar} name={ME.name} />
        <span className="gr-navitem__account">
          <span className="gr-navitem__name">{ME.name}</span>
          <span className="gr-navitem__role gr-type-micro">{ME_ROLE}</span>
        </span>
      </button>
    </nav>
  );
}

/* 18x18 icons, 1.5 stroke, currentColor so they inherit the nav item state. */
function IconGrid() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="2" width="6" height="6" rx="1.5" /><rect x="10" y="2" width="6" height="6" rx="1.5" />
    <rect x="2" y="10" width="6" height="6" rx="1.5" /><rect x="10" y="10" width="6" height="6" rx="1.5" />
  </svg>;
}
function IconBars() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 15V9M9 15V3M15 15v-4" />
  </svg>;
}
function IconTarget() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="9" r="6.5" /><circle cx="9" cy="9" r="2.5" />
  </svg>;
}
function IconDoc() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M4 2.5h6l4 4v9H4z" /><path d="M10 2.5v4h4" />
  </svg>;
}
function IconBell() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M4.5 7a4.5 4.5 0 019 0c0 3 1 4.5 1 4.5h-11S4.5 10 4.5 7z" /><path d="M7.5 14a1.5 1.5 0 003 0" />
  </svg>;
}
function IconSliders() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M3 5.5h12M3 12.5h12" /><circle cx="7" cy="5.5" r="1.75" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12.5" r="1.75" fill="currentColor" stroke="none" />
  </svg>;
}
