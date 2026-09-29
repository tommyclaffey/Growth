import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './RangeCalendar.css';

/**
 * Pick a date range by clicking two days on a calendar.
 *
 * Tommy, Sept 29: "choose the start and end date from this day to whatever this
 * day is." The two typed date boxes worked, but a range is a SHAPE -- seeing
 * the days between highlighted is the point. So: two months side by side, the
 * first click sets the start, the second the end (either order), the range
 * fills in, and presets sit beside it for the usual windows.
 *
 * Pure dates, no clock: `max` is the last day of DATA (the product's "today"),
 * `min` the first. Days outside are disabled, never silently clamped, and a
 * range longer than `maxDays` cannot be applied -- the reason is said.
 *
 * Keyboard: Tab into the grid, arrows move a day (a week up/down), Enter picks,
 * PageUp/PageDown change month. Every day is a button with its full date as
 * its name.
 */

export interface RangeCalendarProps {
  /** ISO dates. */
  start: string;
  end: string;
  min: string;
  max: string;
  maxDays: number;
  onApply: (start: string, end: string) => void;
  onCancel: () => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const x = d(s); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const daysBetween = (a: string, b: string) => Math.round((d(b).getTime() - d(a).getTime()) / 86_400_000);
const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
const addMonths = (s: string, n: number) => { const x = d(monthStart(s)); x.setUTCMonth(x.getUTCMonth() + n); return iso(x); };
const lastOfMonth = (s: string) => addDays(addMonths(s, 1), -1);
const pretty = (s: string) => { const x = d(s); return `${MONTHS[x.getUTCMonth()].slice(0, 3)} ${x.getUTCDate()}, ${x.getUTCFullYear()}`; };

function presetsFor(max: string, min: string) {
  const clampStart = (s: string) => (s < min ? min : s);
  const lastMonthEnd = addDays(monthStart(max), -1);
  return [
    { label: 'Last 7 days', start: clampStart(addDays(max, -6)), end: max },
    { label: 'Last 30 days', start: clampStart(addDays(max, -29)), end: max },
    { label: 'Last 90 days', start: clampStart(addDays(max, -89)), end: max },
    { label: 'This month', start: clampStart(monthStart(max)), end: max },
    { label: 'Last month', start: clampStart(monthStart(lastMonthEnd)), end: lastMonthEnd },
    { label: 'Last 365 days', start: clampStart(addDays(max, -364)), end: max },
  ];
}

export function RangeCalendar({ start, end, min, max, maxDays, onApply, onCancel }: RangeCalendarProps) {
  /* `anchor` is the first click of a new range; null when a whole range is set. */
  const [sel, setSel] = useState<{ start: string; end: string }>({ start, end });
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  /* The RIGHT-hand month. Opens on the month the current range ends in. */
  const [right, setRight] = useState(monthStart(end));
  const [focusDay, setFocusDay] = useState(end);
  const grid = useRef<HTMLDivElement>(null);

  /* While picking, the range previews to wherever the pointer (or focus) is. */
  const lo = anchor ? ([anchor, hover ?? anchor].sort()[0]) : sel.start;
  const hi = anchor ? ([anchor, hover ?? anchor].sort()[1]) : sel.end;
  const length = daysBetween(sel.start, sel.end) + 1;
  const tooLong = length > maxDays;

  function pick(day: string) {
    if (day < min || day > max) return;
    if (!anchor) { setAnchor(day); setSel({ start: day, end: day }); return; }
    const [a, b] = [anchor, day].sort();
    setSel({ start: a, end: b });
    setAnchor(null);
  }

  function move(day: string) {
    const t = day < min ? min : day > max ? max : day;
    setFocusDay(t);
    if (anchor) setHover(t);
    if (t < addMonths(right, -1)) setRight(addMonths(right, -1));
    else if (t > lastOfMonth(right)) setRight(addMonths(right, 1));
    requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-day="${t}"]`)?.focus());
  }

  function onKey(e: KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) { e.preventDefault(); move(addDays(focusDay, step[e.key])); }
    else if (e.key === 'PageUp') { e.preventDefault(); move(addDays(focusDay, -30)); }
    else if (e.key === 'PageDown') { e.preventDefault(); move(addDays(focusDay, 30)); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
  }

  const months = [addMonths(right, -1), right];
  const canBack = addMonths(right, -1) > monthStart(min);
  const canFwd = right < monthStart(max);
  const presets = useMemo(() => presetsFor(max, min), [max, min]);

  return (
    <div className="gr-cal" role="dialog" aria-label="Choose dates" onKeyDown={onKey}>
      <ul className="gr-cal__presets" aria-label="Quick ranges">
        {presets.map((p) => {
          const on = !anchor && sel.start === p.start && sel.end === p.end;
          return (
            <li key={p.label}>
              <button type="button" className={`gr-cal__preset gr-type-body ${on ? 'is-on' : ''}`}
                      aria-pressed={on}
                      onClick={() => { setAnchor(null); setSel({ start: p.start, end: p.end }); setRight(monthStart(p.end)); setFocusDay(p.end); }}>
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="gr-cal__main">
        <div className="gr-cal__nav">
          <button type="button" className="gr-cal__step gr-type-section" aria-label="Previous month" disabled={!canBack}
                  onClick={() => setRight(addMonths(right, -1))}>‹</button>
          <button type="button" className="gr-cal__step gr-type-section" aria-label="Next month" disabled={!canFwd}
                  onClick={() => setRight(addMonths(right, 1))}>›</button>
        </div>

        <div className="gr-cal__months" ref={grid} onMouseLeave={() => setHover(null)}>
          {months.map((m) => {
            const first = d(m);
            const lead = (first.getUTCDay() + 6) % 7;        // Monday-first
            const count = daysBetween(m, addMonths(m, 1));
            return (
              <div key={m} className="gr-cal__month">
                <p className="gr-cal__title gr-type-body-medium">{MONTHS[first.getUTCMonth()]} {first.getUTCFullYear()}</p>
                <div className="gr-cal__grid" role="grid" aria-label={`${MONTHS[first.getUTCMonth()]} ${first.getUTCFullYear()}`}>
                  {WEEKDAYS.map((w) => <span key={w} className="gr-cal__wd gr-type-micro" aria-hidden="true">{w}</span>)}
                  {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
                  {Array.from({ length: count }, (_, i) => {
                    const day = addDays(m, i);
                    const off = day < min || day > max;
                    const inRange = day >= lo && day <= hi;
                    const edge = day === lo || day === hi;
                    return (
                      <button
                        key={day} type="button" data-day={day}
                        className={`gr-cal__day gr-type-body ${inRange ? 'is-in' : ''} ${edge ? 'is-edge' : ''} ${day === lo ? 'is-start' : ''} ${day === hi ? 'is-end' : ''}`}
                        disabled={off}
                        tabIndex={day === focusDay ? 0 : -1}
                        aria-label={pretty(day)}
                        aria-pressed={edge}
                        onClick={() => { setFocusDay(day); pick(day); }}
                        onMouseEnter={() => anchor && setHover(day)}
                        onFocus={() => setFocusDay(day)}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="gr-cal__foot">
          <span className={`gr-type-caption ${tooLong ? 'gr-cal__warn' : 'gr-cal__range'}`} role="status">
            {anchor ? 'Now pick the end day.'
              : tooLong ? `${length} days — the longest range is ${maxDays}.`
              : `${pretty(sel.start)} – ${pretty(sel.end)} · ${length} day${length === 1 ? '' : 's'}`}
          </span>
          <button type="button" className="gr-cal__btn gr-type-label-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="gr-cal__btn is-primary gr-type-label-button"
                  disabled={Boolean(anchor) || tooLong}
                  onClick={() => onApply(sel.start, sel.end)}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
