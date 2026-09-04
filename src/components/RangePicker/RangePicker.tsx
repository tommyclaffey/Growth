import { useRef, useState } from 'react';
import { useMenu } from '../../data/useMenu';
import '../ChannelSwitcher/ChannelSwitcher.css';
import { RANGES, RANGE_LABEL, type Range } from '../../data/metrics';

export interface RangePickerProps {
  value: Range;
  onChange: (next: Range) => void;
}

/**
 * Date range picker.
 *
 * Deliberately reuses ChannelSwitcher's stylesheet rather than duplicating a
 * near-identical menu. Two dropdowns that look the same should not be two
 * sets of CSS drifting apart — that is the same failure the two disagreeing
 * Buttons caused in the Figma file.
 */
export function RangePicker({ value, onChange }: RangePickerProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  /* Outside-click, Escape with focus restore, and arrow-key navigation.
     All three menus declared role="listbox" and implemented none of it. */
  useMenu(open, setOpen, wrap);

  return (
    <div className="gr-switcher" ref={wrap}>
      <button
        type="button"
        className="gr-switcher__trigger gr-type-label-button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {RANGE_LABEL[value]}
        <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true" className="gr-switcher__caret">
          <path d="M1 1L4 4L7 1" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="gr-switcher__menu" role="listbox" aria-label="Date range"
             style={{ width: 200 }}>
          {RANGES.map((r) => (
            <button
              key={r} type="button" role="option" aria-selected={value === r}
              className={`gr-switcher__row gr-type-body ${value === r ? 'is-selected' : ''}`}
              onClick={() => { onChange(r); setOpen(false); }}
            >
              <span className="gr-switcher__label">{RANGE_LABEL[r]}</span>
              {value === r && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
