import { useRef, useState } from 'react';
import './BottomNav.css';
import { MORE_ICON, NAV, type NavKey } from '../Sidebar/nav';
import { useOverlay } from '../../data/useOverlay';

/**
 * ⭐ The phone's navigation (Oct 4, Tommy: "bottom tab bar").
 *
 * Four tabs and More -- the check-in loop gets a thumb-reach tab each:
 * Overview (what happened), Decisions (what to do), Campaigns (where), and
 * Notifications (what changed). Channels, Ads, Reports and Settings live in
 * More, with Team chat and Export, which have no room in a phone's top bar.
 *
 * Rendered always, SHOWN only on a phone (BottomNav.css): the desktop sidebar
 * and this read the same NAV list, so a renamed screen cannot drift between them.
 */
const TABS: NavKey[] = ['overview', 'decisions', 'campaigns', 'notifications'];
const MORE: NavKey[] = ['channels', 'ads', 'reports', 'settings'];
const item = (k: NavKey) => NAV.find((n) => n.key === k)!;

export interface BottomNavProps {
  active: NavKey;
  onNavigate: (key: NavKey) => void;
  counts?: Partial<Record<NavKey, number>>;
  onTeam?: () => void;
  onExport?: () => void;
  /** Light / dark. The sidebar has the button; on a phone it is a row here. */
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export function BottomNav({ active, onNavigate, counts = {}, onTeam, onExport, theme, onToggleTheme }: BottomNavProps) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  useOverlay(open, sheet, () => setOpen(false));
  const moreActive = MORE.includes(active);
  const go = (k: NavKey) => { setOpen(false); onNavigate(k); };

  return (
    <>
      <nav className="gr-bottomnav" aria-label="Main">
        {TABS.map((k) => {
          const it = item(k);
          const on = active === k;
          const n = counts[k];
          return (
            <button key={k} type="button" className={`gr-bottomnav__tab gr-type-micro ${on ? 'is-active' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    aria-label={n ? `${it.label}, ${n} waiting` : undefined}
                    onClick={() => onNavigate(k)}>
              <span className="gr-bottomnav__icon" aria-hidden="true">
                {it.icon}
                {n !== undefined && n > 0 && (
                  <span className={`gr-bottomnav__count gr-type-micro ${k === 'decisions' ? 'is-accent' : ''}`}>{n > 99 ? '99+' : n}</span>
                )}
              </span>
              {it.label}
            </button>
          );
        })}
        <button type="button" className={`gr-bottomnav__tab gr-type-micro ${moreActive ? 'is-active' : ''}`}
                aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="gr-bottomnav__icon" aria-hidden="true">{MORE_ICON}</span>
          More
        </button>
      </nav>

      {open && (
        <div className="gr-bottomnav__scrim" onClick={() => setOpen(false)}>
          <div ref={sheet} className="gr-bottomnav__sheet" role="dialog" aria-modal="true" aria-label="More"
               onClick={(e) => e.stopPropagation()}>
            <span className="gr-bottomnav__grip" aria-hidden="true" />
            <ul className="gr-bottomnav__list">
              {MORE.map((k) => {
                const it = item(k);
                return (
                  <li key={k}>
                    <button type="button" className={`gr-bottomnav__row gr-type-body-medium ${active === k ? 'is-active' : ''}`}
                            aria-current={active === k ? 'page' : undefined} onClick={() => go(k)} autoFocus={k === MORE[0]}>
                      <span className="gr-bottomnav__icon" aria-hidden="true">{it.icon}</span>
                      {it.label}
                    </button>
                  </li>
                );
              })}
            </ul>
            {(onTeam || onExport || onToggleTheme) && (
              <ul className="gr-bottomnav__list gr-bottomnav__list--actions">
                {onTeam && <li><button type="button" className="gr-bottomnav__row gr-type-body-medium" onClick={() => { setOpen(false); onTeam(); }}>Team chat</button></li>}
                {onExport && <li><button type="button" className="gr-bottomnav__row gr-type-body-medium" onClick={() => { setOpen(false); onExport(); }}>Export CSV</button></li>}
                {/* Stays open: the row's own label flipping is the confirmation. */}
                {onToggleTheme && <li><button type="button" className="gr-bottomnav__row gr-type-body-medium" onClick={onToggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button></li>}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
