import { useEffect, useRef, useState } from 'react';
import { RangeCalendar } from '../RangeCalendar/RangeCalendar';
import { useMenu } from '../../data/useMenu';
import '../ChannelSwitcher/ChannelSwitcher.css';
import {
  DAY_ISO, MAX_RANGE, RANGES, dataSpan, isRange, lastLabel, rangeLabel, windowEnd, windowFromDates, type Range,
} from '../../data/metrics';

export interface RangePickerProps {
  value: Range;
  /** `endBack` = days between the window's last day and the last day of data. 0 = "Last N days". */
  onChange: (next: Range, endBack?: number) => void;
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
  /* Custom DATES: a start and an end, anywhere in the account's history. */
  const [dates, setDates] = useState<{ start: string; end: string } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const custDates = windowEnd() > 0;
  /* Closing the calendar, however it happens, hands focus back to the button
     that opened it -- it used to land on <body>. */
  const closeDates = (restore = true) => {
    setDates(null);
    if (restore) requestAnimationFrame(() => trigger.current?.focus());
  };

  /* Outside-click, Escape with focus restore, and arrow-key navigation.
     All three menus declared role="listbox" and implemented none of it. */
  useMenu(open, setOpen, wrap);

  /* The calendar closes on a click outside it, and on Escape from ANYWHERE --
     focus can still be on the date button when it opens, where the calendar's
     own key handler never heard it. */
  const isOpen = Boolean(dates);
  useEffect(() => {
    if (!isOpen) return;
    const out = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) { setDates(null); }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setDates(null); requestAnimationFrame(() => trigger.current?.focus()); }
    };
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [isOpen]);

  if (custom !== null) {
    const n = Number(custom);
    const ok = isRange(n);
    const done = () => setCustom(null);
    return (
      <form
        className="gr-switcher gr-range-custom gr-type-label-button"
        onSubmit={(e) => { e.preventDefault(); if (ok) { onChange(n, 0); done(); } }}
      >
        <label htmlFor="gr-range-days">Last</label>
        <input
          id="gr-range-days" className="gr-range-custom__input gr-type-label-button"
          type="number" inputMode="numeric" min={1} max={MAX_RANGE} value={custom} autoFocus
          aria-describedby="gr-range-hint" aria-invalid={!ok}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); done(); } }}
          onBlur={() => { if (ok) onChange(n, 0); done(); }}
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
        ref={trigger}
        type="button"
        className="gr-switcher__trigger gr-type-label-button"
        /* With the calendar open, the button closes it -- it used to open the
           menu UNDERNEATH the calendar, both "expanded" at once. */
        onClick={() => (dates ? closeDates() : setOpen((o) => !o))}
        aria-haspopup="listbox"
        aria-expanded={open || Boolean(dates)}
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
              key={r} type="button" role="option" aria-selected={!custDates && value === r}
              className={`gr-switcher__row gr-type-body ${!custDates && value === r ? 'is-selected' : ''}`}
              onClick={() => { onChange(r, 0); setOpen(false); }}
            >
              <span className="gr-switcher__label">{lastLabel(r)}</span>
              {!custDates && value === r && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
            </button>
          ))}
          {/* Selected when the current range is not a preset -- it came from
              here, so this is where it is shown as chosen. */}
          <button
            type="button" role="option" aria-selected={!custDates && !RANGES.includes(value)}
            className={`gr-switcher__row gr-type-body ${!custDates && !RANGES.includes(value) ? 'is-selected' : ''}`}
            onClick={() => { setOpen(false); setCustom(String(RANGES.includes(value) || custDates ? 14 : value)); }}
          >
            <span className="gr-switcher__label">
              {RANGES.includes(value) || custDates ? 'Custom…' : `Custom: ${value} days`}
            </span>
            {!custDates && !RANGES.includes(value) && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
          </button>
          {/* Exact start and end dates, anywhere in the account's history. */}
          <button
            type="button" role="option" aria-selected={custDates}
            className={`gr-switcher__row gr-type-body ${custDates ? 'is-selected' : ''}`}
            onClick={() => {
              setOpen(false);
              const endIdx = DAY_ISO.length - 1 - windowEnd();
              setDates({ start: DAY_ISO[endIdx - value + 1] ?? DAY_ISO[0], end: DAY_ISO[endIdx] });
            }}
          >
            <span className="gr-switcher__label">{custDates ? rangeLabel(value) : 'Custom dates…'}</span>
            {custDates && <span className="gr-switcher__check" aria-hidden="true">✓</span>}
          </button>
        </div>
      )}

      {dates && (
        <RangeCalendar
          start={dates.start} end={dates.end}
          min={dataSpan()[0]} max={dataSpan()[1]} maxDays={MAX_RANGE}
          onCancel={() => closeDates()}
          onApply={(a, b) => {
            const w = windowFromDates(a, b);
            if (w) onChange(w.range, w.endBack);
            closeDates();
          }}
        />
      )}
    </div>
  );
}
