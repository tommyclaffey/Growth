import { useEffect, useRef, useState } from 'react';
import './ChannelSwitcher.css';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { CHANNEL_KEYS, CHANNEL_LABEL } from '../../data/metrics';
import type { ChannelName } from '../../styles/tokens';


export interface ChannelSwitcherProps {
  value: ChannelName | null;
  onChange: (v: ChannelName | null) => void;
}

/**
 * Channel switcher — the menu is 240 wide, radius/md, 6px padding, 2px gap,
 * on surface/card with border/default and Elevation/Menu. Rows are 228x36,
 * radius/sm, 8/10 padding, 10px gap, with a 10px channel dot.
 *
 * Row states come straight off the Channel row component set:
 *   default   no fill,           label text/secondary
 *   hover     surface/page-top,  label text/primary
 *   selected  accent/tint,       label accent/text, check visible
 *
 * The dot is never the only signal — the channel name always sits beside it,
 * which is what keeps channel identity out of colour-only territory.
 */
export function ChannelSwitcher({ value, onChange }: ChannelSwitcherProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(next: ChannelName | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="gr-switcher" ref={wrap}>
      <button
        type="button"
        className="gr-switcher__trigger gr-type-label-button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value && (
          <ChannelMark channel={value} size={16} />
        )}
        {value ? CHANNEL_LABEL[value] : 'All channels'}
        <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true" className="gr-switcher__caret">
          <path d="M1 1L4 4L7 1" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="gr-switcher__menu" role="listbox" aria-label="Channel">
          <button
            type="button" role="option" aria-selected={value === null}
            className={`gr-switcher__row gr-type-body ${value === null ? 'is-selected' : ''}`}
            onClick={() => pick(null)}
          >
            <span className="gr-switcher__dot gr-switcher__dot--all" aria-hidden="true" />
            <span className="gr-switcher__label">All channels</span>
            {value === null && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
          </button>

          {CHANNEL_KEYS.map((key) => (
            <button
              key={key} type="button" role="option" aria-selected={value === key}
              className={`gr-switcher__row gr-type-body ${value === key ? 'is-selected' : ''}`}
              onClick={() => pick(key)}
            >
              <ChannelMark channel={key} size={16} />
              <span className="gr-switcher__label">{CHANNEL_LABEL[key]}</span>
              {value === key && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
