import { useRef, useState } from 'react';
import { useMenu } from '../../data/useMenu';
import '../ChannelSwitcher/ChannelSwitcher.css';
import { MAX_RANGE, RANGES, isRange, rangeLabel, type Range } from '../../data/metrics';

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
  /* Custom: the trigger becomes a "Last [ n ] days" field. In place rather than
     inside the menu, because the menu is a listbox -- arrow keys move between
     options and Tab closes it -- and a text field inside one fights both. */
  const [custom, setCustom] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  /* Outside-click, Escape with focus restore, and arrow-key navigation.
     All three menus declared role="listbox" and implemented none of it. */
  useMenu(open, setOpen, wrap);

  if (custom !== null) {
    const n = Number(custom);
    const ok = isRange(n);
    const done = () => setCustom(null);
    return (
      <form
        className="gr-switcher gr-range-custom gr-type-label-button"
        onSubmit={(e) => { e.preventDefault(); if (ok) { onChange(n); done(); } }}
      >
        <label htmlFor="gr-range-days">Last</label>
        <input
          id="gr-range-days" className="gr-range-custom__input gr-type-label-button"
          type="number" inputMode="numeric" min={1} max={MAX_RANGE} value={custom} autoFocus
          aria-describedby="gr-range-hint" aria-invalid={!ok}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } }}
          onBlur={() => { if (ok) onChange(n); done(); }}
        />
        <span>days</span>
        <span id="gr-range-hint" className="gr-sr-only">
          1 to {MAX_RANGE}. Enter to apply, Escape to cancel.
        </span>
      </form>
    );
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
        {rangeLabel(value)}
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
              <span className="gr-switcher__label">{rangeLabel(r)}</span>
              {value === r && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
            </button>
          ))}
          {/* Selected when the current range is not a preset -- it came from
              here, so this is where it is shown as chosen. */}
          <button
            type="button" role="option" aria-selected={!RANGES.includes(value)}
            className={`gr-switcher__row gr-type-body ${!RANGES.includes(value) ? 'is-selected' : ''}`}
            onClick={() => { setOpen(false); setCustom(String(RANGES.includes(value) ? 14 : value)); }}
          >
            <span className="gr-switcher__label">
              {RANGES.includes(value) ? 'Custom…' : `Custom: ${value} days`}
            </span>
            {!RANGES.includes(value) && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}
