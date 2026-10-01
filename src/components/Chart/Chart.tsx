import { useEffect, useRef, useState } from 'react';
import { CSS_CHANNEL } from '../../styles/tokens';
import './Chart.css';
import { channelGradient, type ChannelName } from '../../styles/tokens';
import {
  DAY_ISO, METRICS, compareShift, deltaTone, domainFor, formatMetric, isRatio, sliceWindow, windowDates,
  yTicks as computeTicks,
  type ComparePeriod, type Metric, CHANNEL_LABEL } from '../../data/metrics';
import { resolveMark, type Mark } from './mark';
import { smoothPath } from './smoothPath';
import { MetricToggle } from '../MetricToggle/MetricToggle';
import { betterHigher } from '../../data/channelMetrics';
import { bucketsOf } from '../../data/buckets';
import { changeThreshold } from '../../data/notifications';

export { METRICS };
export type { Metric };
export type { Mark };

export interface ChartProps {
  title?: string;
  channel: ChannelName | 'all';
  metric: Metric;
  /** The metrics this scope can plot (`chartMetricsFor`). Default: all six. */
  metrics?: Metric[];
  onMetricChange?: (m: Metric) => void;
  data: { label: string; value: number }[];
  /** Override the mark. Default 'auto' applies the rule below. */
  mark?: Mark;
  state?: 'ready' | 'loading' | 'error' | 'empty';
  /** Fired by Retry in the error state. Without it the button is decoration. */
  onRetry?: () => void;
  /**
   * Returns the series for a second metric, drawn over the first on its own
   * right-hand axis. Omit it and the Compare control does not render.
   * A function rather than data, because only the chart knows which metric
   * the reader picked -- the caller only knows how to fetch one.
   */
  compareSeries?: (m: Metric) => { label: string; value: number }[];
  /**
   * The same metric over the same number of days, `shiftDays` earlier -- the
   * "same days last week / month / year" comparison. Empty when the data does
   * not reach that far back. Omit it and those options do not render.
   */
  periodSeries?: (m: Metric, shiftDays: number) => { label: string; value: number }[];
}

/* Same days, earlier. Week is 7 days; month and year are CALENDAR -- Aug 1-12
   against Jul 1-12, not against 30 days before. */
const PERIODS: { key: ComparePeriod; label: string; noun: string }[] = [
  { key: 'week', label: 'Last week', noun: 'last week' },
  { key: 'month', label: 'Last month', noun: 'last month' },
  { key: 'year', label: 'Last year', noun: 'last year' },
];
/* Which extra metrics the table shows, remembered in this browser. */
const COLS_KEY = 'growth.tableColumns';
/* ⭐ Every metric is ON until someone turns one off (Tommy, Sept 30). The
   table is where you go to see everything at once; starting it on one column
   made the first thing to do a round of clicking. A saved choice still wins. */
function savedCols(): Metric[] {
  try {
    const stored = localStorage.getItem(COLS_KEY);
    if (stored === null) return [...METRICS];
    const raw = JSON.parse(stored);
    const picked = Array.isArray(raw) ? METRICS.filter((m) => raw.includes(m)) : [];
    return picked.length ? picked : [...METRICS];
  } catch { return [...METRICS]; }
}
/* How the table groups days. Day = a row per day (the Compare control adds
   Now | Then | Change). Week / Month = a COLUMN per week or month across the
   window, oldest to newest, so a trend reads left to right. */
type GroupBy = 'day' | 'week' | 'month';
const GROUP_KEY = 'growth.tableGroup';
function savedGroup(): GroupBy {
  try {
    const g = localStorage.getItem(GROUP_KEY);
    return g === 'week' || g === 'month' ? g : 'day';
  } catch { return 'day'; }
}
const isPeriod = (v: unknown): v is ComparePeriod => v === 'week' || v === 'month' || v === 'year';
const pct = (now: number, then: number) => (then === 0 ? null : Math.round(((now - then) / Math.abs(then)) * 100));
const signed = (n: number | null) => (n === null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`);


export function Chart({
  title,
  channel,
  metric,
  metrics = METRICS,
  onMetricChange,
  data,
  mark = 'auto',
  state = 'ready', onRetry,
  compareSeries,
  periodSeries,
}: ChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  /* The overlay metric. Derived against `metric` rather than reset in an
     effect: comparing Spend with Spend is meaningless, so if the reader
     switches the main metric to whatever they were comparing against, the
     overlay simply stops drawing -- and comes back if they switch away. */
  /* One Compare control, two kinds of comparison: another METRIC (its own
     right-hand axis), or the same metric over the same days EARLIER (same
     axis -- same units, directly comparable). */
  const [comparePick, setComparePick] = useState<Metric | ComparePeriod | null>(null);
  /* Whether the last press on the select came from a pointer. Chrome treats a
     <select> as :focus-visible even after a mouse click, so the ring stayed on
     after picking a metric. A mouse pick lets go of focus; a keyboard pick
     keeps it, because a keyboard user still needs to see where they are. */
  const pickedByPointer = useRef(false);
  const compare = compareSeries && comparePick && !isPeriod(comparePick) && comparePick !== metric
    && metrics.includes(comparePick) ? comparePick : null;
  const cData = compare ? compareSeries!(compare) : [];
  const period = periodSeries && isPeriod(comparePick) ? comparePick : null;
  const periodInfo = period ? PERIODS.find((p) => p.key === period)! : null;
  /* Only drawn when it lines up day for day. A window reaching back before the
     account's data returns nothing -- said, never drawn as zeros. */
  const shiftDays = period ? compareShift(period) : 0;
  const pRaw = period ? periodSeries!(metric, shiftDays) : [];
  const pData = pRaw.length === data.length ? pRaw : [];
  /* The earlier days' YEARS. "Last year · Jul 14 – Aug 12" did not say which
     year, and the table showed "Jul 14" in both columns. Shown whenever the
     comparison is in a different year from now. */
  const nowIso = sliceWindow(DAY_ISO, data.length);
  const pIso = period ? sliceWindow(DAY_ISO, data.length, 0, shiftDays) : [];
  const otherYear = pIso.length > 0 && nowIso.length > 0
    && pIso[pIso.length - 1].slice(0, 4) !== nowIso[nowIso.length - 1].slice(0, 4);
  const pLabel = (i: number) => (otherYear && pIso[i] ? `${pData[i].label}, ${pIso[i].slice(0, 4)}` : pData[i].label);
  const pSpan = () => {
    if (!otherYear) return spanOf(pData);
    const [a, b] = windowDates(data.length, 0, shiftDays);
    return `${a} – ${b}`;
  };

  /* A reader's override of the automatic choice, null while they have not
     expressed one. Kept separate from the `mark` prop rather than replacing
     it: `auto` still means "let the rule decide", so switching metric goes
     back to the right default for that metric instead of pinning bars onto a
     ratio the rule would never have drawn as bars. */
  const [chosen, setChosen] = useState<'bar' | 'line' | 'table' | null>(null);
  const [tableCols, setTableCols] = useState<Metric[]>(savedCols);
  /* Table rows by Day, or columns by Week / Month -- remembered. */
  const [groupBy, setGroupByState] = useState<GroupBy>(savedGroup);
  const tableWrap = useRef<HTMLDivElement>(null);
  /* Newest is the TOP row, so a regroup or a new window opens at the top. */
  const bucketCount = data.length;
  useEffect(() => {
    const w = tableWrap.current;
    if (w) w.scrollTop = 0;
  }, [groupBy, bucketCount, chosen]);
  const setGroupBy = (g: GroupBy) => {
    setGroupByState(g);
    try { localStorage.setItem(GROUP_KEY, g); } catch { /* quota */ }
  };

  const auto = resolveMark(metric, data.length, mark);
  /* A ratio is never drawn as bars, whatever is clicked. A bar encodes
     magnitude as length from zero, and CAC or ROAS has no zero to measure
     from -- the rule in mark.ts exists for that reason and an override should
     not be able to walk past it. */
  const canBar = !isRatio(metric);
  const resolved = chosen === 'table' ? 'table'
    : chosen && (chosen === 'line' || canBar) ? chosen : auto;
  // Bars must start at zero; a ratio line must not.
  const zeroBased = resolved === 'bar' || !isRatio(metric);
  /* The earlier period shares the axis, so the scale must hold both. */
  const scaleData = pData.length ? [...data, ...pData] : data;
  const ticks = computeTicks(metric, scaleData, zeroBased);
  const [lo, hi] = domainFor(scaleData, zeroBased);
  const span = hi - lo || 1;

  const key = channel === 'all' ? 'accent' : (CSS_CHANNEL[channel] ?? channel);
  const stroke = channel === 'all' ? 'var(--accent-base)' : `var(--channel-${key})`;
  const fill = channel === 'all'
    ? 'linear-gradient(to bottom, var(--accent-gradient-top), var(--accent-gradient-bottom))'
    : channelGradient(channel);
  const edge = channel === 'all' ? 'var(--accent-gradient-bottom)' : `var(--channel-${key}-soft)`;

  /* Normalised 0-100 viewBox with preserveAspectRatio="none", so the path
     stretches to the plot. vector-effect keeps the stroke 2px regardless. */
  const pointAt = (i: number) => ({
    x: data.length === 1 ? 50 : (i / (data.length - 1)) * 100,
    y: 100 - ((data[i].value - lo) / span) * 100,
  });
  const linePath = data.map((_, i) => {
    const { x, y } = pointAt(i);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  const areaPath = `${linePath} L 100 100 L 0 100 Z`;

  /* ---- The overlay: a second metric on its own scale ----------------------

     Two metrics almost never share units -- Spend is thousands of dollars,
     ROAS is 3 to 5 -- so the overlay gets its own domain and its own axis on
     the right. What the reader compares is SHAPE: does ROAS fall as spend
     rises? The two axes are labelled so nobody reads the heights against
     each other as if they were one scale.

     Always a line, whatever the main mark is: a line over bars stays legible,
     bars over bars would hide each other. Same zero rule as the main line --
     a quantity starts at zero, a ratio does not. */
  const cZero = compare ? !isRatio(compare) : true;
  const cTicks = compare ? computeTicks(compare, cData, cZero) : [];
  const [cLo, cHi] = compare ? domainFor(cData, cZero) : [0, 1];
  const cSpan = cHi - cLo || 1;
  /* Over bars, each point sits on its bar's centre, not on an edge-to-edge
     spread -- otherwise the first and last points hang off the outer bars and
     every reading in between drifts half a bar sideways. */
  const cPointAt = (i: number) => ({
    x: resolved === 'bar'
      ? ((i + 0.5) / cData.length) * 100
      : cData.length === 1 ? 50 : (i / (cData.length - 1)) * 100,
    y: 100 - ((cData[i].value - cLo) / cSpan) * 100,
  });
  const cPath = smoothPath(cData.map((_, i) => cPointAt(i)));

  /* The earlier period: the MAIN scale (same units), dashed. Over bars, on the
     bar centres, like the metric overlay. */
  const pPointAt = (i: number) => ({
    x: resolved === 'bar'
      ? ((i + 0.5) / pData.length) * 100
      : pData.length === 1 ? 50 : (i / (pData.length - 1)) * 100,
    y: 100 - ((pData[i].value - lo) / span) * 100,
  });
  const pPath = pData.map((_, i) => {
    const { x, y } = pPointAt(i);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  const spanOf = (d: { label: string }[]) => (d.length ? `${d[0].label} – ${d[d.length - 1].label}` : '');
  /* A total only where one is honest: a sum of daily Spend is the period's
     spend; a sum (or average) of daily CAC is not the period's CAC. */
  const sum = (d: { value: number }[]) => d.reduce((a, x) => a + x.value, 0);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))));
  }

  const hovered = hover !== null ? data[hover] : null;
  const cHovered = compare && hover !== null ? cData[hover] : null;
  const pHovered = pData.length && hover !== null ? pData[hover] : null;
  // The crosshair follows the same rule: bar centre over bars, point over a line.
  const hoverX = hover === null ? 0
    : resolved === 'bar' ? ((hover + 0.5) / data.length) * 100
    : pointAt(hover).x;

  /* The chart's numbers, reachable without sight.

     Every part of the visualisation is aria-hidden or an unlabelled <span>:
     the axes, the bars, the line. So the section announced its own name and
     then nothing -- the primary visualisation in the product conveyed no data
     at all. The hover tooltip carried the only readable values and needs a
     mouse to produce them.

     A table rather than a summary sentence, because the underlying thing IS
     tabular and a screen reader can navigate one cell by cell. Same numbers,
     same formatter -- it cannot drift from the chart because it is built from
     the same array. */
  const dataTable = resolved === 'table' ? null : (
    <table className="gr-sr-only">
      <caption>{title ?? `${metric} over time`}</caption>
      <thead>
        <tr>
          <th scope="col">Date</th><th scope="col">{metric}</th>
          {compare && <th scope="col">{compare}</th>}
          {pData.length > 0 && <th scope="col">{metric}, {periodInfo!.noun}</th>}
        </tr>
      </thead>
      <tbody>
        {data.map((d, i) => (
          <tr key={i}>
            <th scope="row">{d.label}</th>
            <td>{formatMetric(metric, d.value)}</td>
            {compare && cData[i] && <td>{formatMetric(compare, cData[i].value)}</td>}
            {pData[i] && <td>{formatMetric(metric, pData[i].value)} ({pLabel(i)})</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );

  /* ⭐ THE TABLE VIEW -- the chart's own numbers, readable and copyable. Built
     from the same series as the plot, so it cannot disagree with it.

     Its own controls, and only those (Tommy, Sept 30):
       - WHICH metrics: the checkboxes. The chart's metric buttons are hidden
         here -- two ways to choose the same thing.
       - HOW the days group: Day (a row per day) | Week | Month (a column per
         week or month across the window, oldest -> newest, + Total).
       - WHICH days: the date picker, and nothing else. Compare is hidden here
         -- a second set of dates inside the table would override the main
         one. The trend across weeks IS the comparison. */
  const saved = metrics.filter((m) => tableCols.includes(m) && (compareSeries || m === metric));
  const tableMetrics: Metric[] = saved.length ? saved : [metric];
  const seriesOf = (m: Metric) => (m === metric ? data : compareSeries!(m));
  const cols = tableMetrics.map((m) => ({ m, now: seriesOf(m) }));

  /* A metric over a span of days, honestly: a quantity sums; a ratio is
     rebuilt from its parts -- CAC is spend over leads, ROAS is revenue over
     spend (each day's revenue is its ROAS times its spend) -- never a sum or
     an average of daily ratios. */
  const over = (m: Metric, from: number, to: number): number | null => {
    const part = (x: Metric) => seriesOf(x).slice(from, to);
    const s = part(m);
    if (!s.length) return null;
    if (!isRatio(m)) return sum(s);
    if (!compareSeries) return null;
    const spend = part('Spend');
    if (m === 'CAC') {
      const leads = sum(part('Leads'));
      return leads > 0 ? sum(spend) / leads : null;
    }
    const sp = sum(spend);
    const revenue = s.reduce((acc, x, i) => acc + x.value * (spend[i]?.value ?? 0), 0);
    return sp > 0 ? revenue / sp : null;
  };
  const totalOf = (m: Metric) => over(m, 0, data.length);
  const cell = (m: Metric, v: number | null | undefined) => (v === null || v === undefined ? '—' : formatMetric(m, v));
  const tone = (m: Metric, ch: number | null) => (ch === null ? '' : `is-${deltaTone(ch, betterHigher(m))}`);
  /* ⭐ Colour is for NEWS. Every +1% was green and every -2% red, so ~30 cells
     shouted and the -29% that mattered was one more coloured number. Only a
     move past the line the Needs-attention strip uses (Settings, 15% by
     default) is coloured; the rest stay quiet grey. One definition of "worth
     noticing" across the product. */
  const newsy = changeThreshold();
  const changeTone = (m: Metric, ch: number | null) =>
    (ch !== null && Math.abs(ch) >= newsy ? `${tone(m, ch)} is-news` : '');

  const grouped = groupBy !== 'day';
  const buckets = grouped ? bucketsOf(nowIso, groupBy) : [];

  const controls = (
    <div className="gr-chart__table-bar">
      {compareSeries && (
        <fieldset className="gr-chart__cols">
          <legend className="gr-chart__cols-label gr-type-caption-med">Show</legend>
          {metrics.map((m) => {
            const on = tableMetrics.includes(m);
            /* At least one: an empty table answers nothing. */
            const last = on && tableMetrics.length === 1;
            return (
              <label key={m} className={`gr-chart__col gr-type-caption-med ${on ? 'is-on' : ''}`}
                     title={last ? 'At least one metric stays on' : undefined}>
                <input type="checkbox" checked={on} disabled={last}
                       onChange={(e) => {
                         const next = e.target.checked
                           ? metrics.filter((x) => x === m || tableMetrics.includes(x))
                           : tableMetrics.filter((x) => x !== m);
                         setTableCols(next);
                         try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch { /* quota */ }
                       }} />
                {m}
              </label>
            );
          })}
        </fieldset>
      )}
      {/* The same segmented control as Bar | Line | Table. */}
      <div className="gr-chart__by" role="group" aria-label="Group days by">
        <span className="gr-chart__cols-label gr-type-caption-med" aria-hidden="true">By</span>
        {(['day', 'week', 'month'] as GroupBy[]).map((g) => (
          <button key={g} type="button" aria-pressed={groupBy === g}
                  className={`gr-chart__by-btn gr-type-caption-med ${groupBy === g ? 'is-on' : ''}`}
                  onClick={() => setGroupBy(g)}>
            {g === 'day' ? 'Day' : g === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>
    </div>
  );

  /* ⭐ ONE LAYOUT for Day, Week and Month (Tommy, Sept 30): a ROW per period,
     newest first, a COLUMN per ticked metric, the window's Total pinned under
     the header.

     It was a column per week, oldest -> newest. Two reasons it flipped:
       - The eye compares DOWN a column -- digits stack -- far more easily than
         across a row of thirteen differently-wide cells. "How did spend move
         week to week?" is now a straight scan.
       - Periods are the long list (52 weeks, 365 days) and metrics the short
         one (six at most). Long lists scroll down; across, Day view was a
         sideways-scrolling strip.
     Each figure carries its change against the period BELOW it (the one
     before) -- only between two WHOLE periods: a 3-day week against a 7-day
     one is a smaller number, not a worse week. Day rows carry none: a day
     against the day before is noise. */
  const periods = grouped
    ? buckets
    : data.map((d, i) => ({ start: i, end: i + 1, label: d.label, full: true, days: 1 }));
  const rows = periods.map((b, j) => ({ b, prev: j > 0 ? periods[j - 1] : null })).reverse();
  const periodNoun = groupBy === 'day' ? 'Date' : groupBy === 'week' ? 'Week' : 'Month';

  const periodTable = (
    <table className={`gr-chart__table gr-chart__table--periods ${grouped ? 'has-change' : ''}`}>
      <thead>
        <tr className="gr-type-overline">
          <th scope="col">{periodNoun}</th>
          {cols.map((c) => <th key={c.m} scope="col">{c.m}</th>)}
        </tr>
        {/* The answer first: the window's total, pinned while the periods
            scroll under it. */}
        <tr className="gr-chart__total gr-type-body-medium">
          <th scope="row">Total</th>
          {cols.map((c) => (
            <td key={c.m}>
              <span className="gr-chart__value">{cell(c.m, totalOf(c.m))}</span>
              {grouped && <span className="gr-chart__change" aria-hidden="true" />}
            </td>
          ))}
        </tr>
      </thead>
      <tbody className="gr-type-body">
        {rows.map(({ b, prev }) => (
          <tr key={b.start}>
            <th scope="row">
              {b.label}
              {!b.full && <span className="gr-chart__partial gr-type-micro">{b.days} day{b.days === 1 ? '' : 's'}</span>}
            </th>
            {cols.map((c) => {
              const v = over(c.m, b.start, b.end);
              const pv = prev ? over(c.m, prev.start, prev.end) : null;
              const ch = grouped && prev && b.full && prev.full && v !== null && pv !== null ? pct(v, pv) : null;
              return (
                <td key={c.m}>
                  <span className="gr-chart__value">{cell(c.m, v)}</span>
                  {grouped && (
                    <span className={`gr-chart__change gr-type-micro ${changeTone(c.m, ch)}`}>
                      {ch !== null && <>{signed(ch)}<span className="gr-sr-only"> vs the {groupBy} before</span></>}
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const visibleTable = (
    <>
      {controls}
      <div ref={tableWrap} className="gr-chart__table-wrap" tabIndex={0} aria-label={`${title ?? 'Metrics'} as a table`}>
        {periodTable}
      </div>
    </>
  );
  const isTable = resolved === 'table';

  return (
    <section className={`gr-chart ${isTable ? 'is-table' : ''}`} aria-label={title ?? `${metric} over time`}>
      {dataTable}
      <header className="gr-chart__header">
        <h3 className="gr-chart__title gr-type-card-heading">
          {isTable ? `By ${groupBy}` : (title ?? `${metric} over time`)}
        </h3>
        {/* Hidden in the table: its checkboxes choose the metrics. */}
        {!isTable && <MetricToggle value={metric} options={metrics} onChange={(m) => onMetricChange?.(m)} />}

        {/* A native select, not a second segmented control: two rows of six
            identical pills would make "which one is the main metric" a
            question. Styled to sit on the same 32px tray as the toggle, and
            the main metric is excluded from its own options. */}
        {/* Hidden in the table: the table follows the date picker only. */}
        {!isTable && (compareSeries || periodSeries) && (
          <div className={`gr-chart__compare ${compare || period ? 'is-on' : ''}`}>
            <label className="gr-chart__compare-field">
              <span className="gr-chart__compare-label gr-type-label-button">
                {compare || period ? 'vs' : 'Compare'}
              </span>
              <select
                className="gr-chart__compare-select gr-type-label-button"
                value={compare ?? period ?? ''}
                aria-label="Compare with another metric or an earlier period"
                onPointerDown={() => { pickedByPointer.current = true; }}
                onKeyDown={() => { pickedByPointer.current = false; }}
                onChange={(e) => {
                  setComparePick((e.target.value || null) as Metric | ComparePeriod | null);
                  if (pickedByPointer.current) e.target.blur();
                }}
              >
                <option value="">None</option>
                {periodSeries && (
                  <optgroup label="Same days earlier">
                    {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </optgroup>
                )}
                {compareSeries && (
                  <optgroup label="Another metric">
                    {metrics.filter((m) => m !== metric).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            {(compare || period) && (
              <button type="button" className="gr-chart__compare-clear"
                      aria-label={`Stop comparing with ${compare ?? periodInfo!.noun}`}
                      onClick={() => setComparePick(null)}>
                <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
                  <path d="M3 3l6 6M9 3l-6 6" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Bar or line. Disabled rather than hidden for a ratio: a control
            that disappears leaves the reader wondering whether they imagined
            it, where a disabled one with a reason is answerable. */}
        <div className="gr-chart__marks" role="group" aria-label="Chart type">
          <button
            type="button"
            className={`gr-chart__mark ${resolved === 'bar' ? 'is-on' : ''}`}
            aria-pressed={resolved === 'bar'}
            disabled={!canBar}
            title={canBar ? 'Bars' : 'A ratio has no zero to measure a bar from'}
            onClick={() => setChosen('bar')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <rect x="1.5" y="7" width="3" height="7.5" rx="1" />
              <rect x="6.5" y="3.5" width="3" height="11" rx="1" />
              <rect x="11.5" y="9" width="3" height="5.5" rx="1" />
            </svg>
            <span className="gr-sr-only">Bar chart</span>
          </button>
          <button
            type="button"
            className={`gr-chart__mark ${resolved === 'line' ? 'is-on' : ''}`}
            aria-pressed={resolved === 'line'}
            title="Line"
            onClick={() => setChosen('line')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
                 fill="none" stroke="currentColor" strokeWidth="1.6"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 11.5 5.5 6.5 9 9.5 14.5 3.5" />
            </svg>
            <span className="gr-sr-only">Line chart</span>
          </button>
          <button
            type="button"
            className={`gr-chart__mark ${resolved === 'table' ? 'is-on' : ''}`}
            aria-pressed={resolved === 'table'}
            title="Table"
            onClick={() => setChosen('table')}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"
                 fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
              <path d="M2 6.5h12M2 10h12M6.5 6.5v7" />
            </svg>
            <span className="gr-sr-only">Table</span>
          </button>
        </div>
      </header>

      {state === 'ready' ? (
        <div className={`gr-chart__body ${compare ? 'has-right-axis' : ''}`}>
          {/* One legend, always present. The main key shows on its own until
              there is a comparison, then the second key joins beside it. It
              used to appear only on compare, which made the whole card grow
              ~20px taller the moment Compare was switched on. */}
          {!isTable && <div className="gr-chart__axes gr-type-overline" aria-hidden="true">
            <span className="gr-chart__axis-title">
              <span className="gr-chart__glyph gr-chart__glyph--main" style={{ background: stroke }} />
              {metric}
            </span>
            {compare && (
              <span className="gr-chart__axis-title">
                <span className="gr-chart__glyph gr-chart__glyph--compare" />
                {compare}
              </span>
            )}
            {period && (pData.length > 0 ? (
              <span className="gr-chart__axis-title">
                <span className="gr-chart__glyph gr-chart__glyph--period" style={{ borderColor: stroke }} />
                {periodInfo!.noun} · {pSpan()}
              </span>
            ) : (
              <span className="gr-chart__axis-title gr-chart__axis-note">
                No data for the same days {periodInfo!.noun}
              </span>
            ))}
          </div>}
          {resolved === 'table' ? visibleTable : (<>
          <div className="gr-chart__plot">
            <div className="gr-chart__y" aria-hidden="true">
              {ticks.map((t, i) => <span key={i} className="gr-type-micro">{t}</span>)}
            </div>

            <div
              className="gr-chart__canvas"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              {resolved === 'bar' ? (
                <ol className="gr-chart__bars">
                  {data.map((d, i) => (
                    <li key={i} className="gr-chart__bar-slot">
                      <span
                        className={`gr-chart__bar ${hover === i ? 'is-hovered' : ''}`}
                        style={{
                          height: `${((d.value - lo) / span) * 100}%`,
                          background: fill,
                          borderColor: edge,
                        }}
                      />
                    </li>
                  ))}
                </ol>
              ) : (
                <svg className="gr-chart__svg" viewBox="0 0 100 100"
                     preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={stroke} stopOpacity="0.28" />
                      <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={areaPath} fill={`url(#grad-${key})`} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}

              {compare && (
                <svg className="gr-chart__svg gr-chart__overlay" viewBox="0 0 100 100"
                     preserveAspectRatio="none" aria-hidden="true">
                  {/* No halo. It cut a white notch into every bar the line
                      crossed. Ink on the channel colour is legible on its own. */}
                  <path d={cPath} className="gr-chart__overlay-line"
                        vectorEffect="non-scaling-stroke" />
                </svg>
              )}

              {pData.length > 0 && (
                <svg className="gr-chart__svg gr-chart__overlay" viewBox="0 0 100 100"
                     preserveAspectRatio="none" aria-hidden="true">
                  <path d={pPath} className="gr-chart__overlay-line gr-chart__overlay-line--period"
                        style={{ stroke }} vectorEffect="non-scaling-stroke" />
                </svg>
              )}

              {hovered && (
                <>
                  <span className="gr-chart__crosshair" style={{ left: `${hoverX}%` }} aria-hidden="true" />
                  {resolved === 'line' && (
                    <span
                      className="gr-chart__marker"
                      style={{
                        left: `${hoverX}%`,
                        top: `${pointAt(hover!).y}%`,
                        borderColor: stroke,
                      }}
                      aria-hidden="true"
                    />
                  )}
                  {pHovered && resolved === 'line' && (
                    <span
                      className="gr-chart__marker gr-chart__marker--period"
                      style={{ left: `${hoverX}%`, top: `${pPointAt(hover!).y}%`, borderColor: stroke }}
                      aria-hidden="true"
                    />
                  )}
                  {cHovered && (
                    <span
                      className="gr-chart__marker gr-chart__marker--compare"
                      style={{ left: `${hoverX}%`, top: `${cPointAt(hover!).y}%` }}
                      aria-hidden="true"
                    />
                  )}
                  {/* No role="status". onMouseMove fires per pixel of travel, so
                      a live region here queued an announcement for every index
                      crossed -- one sweep across the chart floods the speech
                      queue with thirty readings nobody asked for. It is
                      pointer-only UI; the table above is what serves AT. The
                      loading and error states keep their live region, because
                      those are state changes a user needs told about. */}
                  <div
                    className={`gr-chart__tip ${hoverX > 80 ? 'is-near-right' : hoverX < 20 ? 'is-near-left' : ''}`}
                    style={{ left: `${hoverX}%` }}
                    aria-hidden="true"
                  >
                    <span className="gr-chart__tip-label gr-type-micro">{hovered.label}</span>
                    <span className="gr-chart__tip-value gr-type-caption-med">
                      {compare && <span className="gr-chart__tip-name">{metric} </span>}
                      {formatMetric(metric, hovered.value)}
                    </span>
                    {cHovered && (
                      <span className="gr-chart__tip-value gr-type-caption-med">
                        <span className="gr-chart__tip-name">{compare} </span>
                        {formatMetric(compare!, cHovered.value)}
                      </span>
                    )}
                    {pHovered && (
                      <>
                        <span className="gr-chart__tip-value gr-type-caption-med">
                          <span className="gr-chart__tip-name">{pLabel(hover!)} </span>
                          {formatMetric(metric, pHovered.value)}
                        </span>
                        <span className="gr-chart__tip-label gr-type-micro">
                          {signed(pct(hovered.value, pHovered.value))} vs {periodInfo!.noun}
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* The overlay's scale gets its own column, mirroring the left
                axis: the bars stop before it rather than running underneath.
                Numbers laid over the last bar on chips were tried and read as
                clutter. Only present while comparing, so a single-metric
                chart still runs its bars to the edge of the card. */}
            {compare && (
              <div className="gr-chart__y gr-chart__y--right" aria-hidden="true">
                {cTicks.map((t, i) => <span key={i} className="gr-type-micro">{t}</span>)}
              </div>
            )}
          </div>

          <div className="gr-chart__baseline" />
          <div className="gr-chart__x" aria-hidden="true">
            {data.map((d, i) => (
              <span key={i} className="gr-type-micro">
                {i % Math.ceil(data.length / 5) === 0 ? d.label : ''}
              </span>
            ))}
          </div>
          </>)}
        </div>
      ) : (
        <div className={`gr-chart__state gr-chart__state--${state}`} role="status">
          {state === 'loading' && <span className="gr-type-body">Loading {metric.toLowerCase()}…</span>}
          {state === 'error' && (
            <span className="gr-type-body">
              {/* CHANNEL_LABEL, not the raw scope key. This printed
                  "Could not reach the paidSearch API" at users, and
                  "the all API" on Overview. */}
              Could not reach the {channel === 'all' ? 'channel' : CHANNEL_LABEL[channel]} API.{' '}
              {/* A Retry with no handler is worse than no Retry: it is the only
                  control in the error state, so a user clicks it and concludes
                  the app is broken twice. */}
              <button type="button" className="gr-chart__retry" onClick={onRetry}>Retry</button>
            </span>
          )}
          {state === 'empty' && (
            <span className="gr-type-body">No {metric.toLowerCase()} recorded for this period.</span>
          )}
        </div>
      )}
    </section>
  );
}
