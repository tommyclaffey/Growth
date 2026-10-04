import { useState } from 'react';
import './ChannelTable.css';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { formatMetric, rangePhrase } from '../../data/metrics';
import { DeltaBadge } from '../DeltaBadge/DeltaBadge';
import { Sparkline } from '../Sparkline/Sparkline';
import { betterHigher, type DerivedMetric } from '../../data/channelMetrics';

const VOLUME: DerivedMetric[] = ['Spend', 'Impressions', 'Clicks', 'Leads', 'Sales'];
const EFFICIENCY: DerivedMetric[] = ['CTR', 'CPC', 'CPM', 'CVR', 'CAC', 'ROAS'];
import { channelGradient, type ChannelName } from '../../styles/tokens';
import type { Target } from '../../data/decisions';

/**
 * Rows carry NUMBERS, not formatted strings.
 *
 * They used to arrive pre-formatted ("$61,240"), which meant the table could
 * render them and nothing else — sorting compared strings, so $9 sorted after
 * $61,240. Formatting is a view concern; it happens at the last moment.
 */
export interface ChannelRow {
  key: ChannelName;
  name: string;
  spend: number;
  leads: number;
  cac: number;
  roas: number;
  /** Change on the chosen metric; null when this channel cannot report it. */
  delta: number | null;
  /** ROAS, always -- see the Trend column. */
  trend: number[];
  /** A second line under the name -- what is inside, e.g. "2 campaigns". */
  sub?: string;
}

/** The "All channels" line at the foot. Rates are recomputed from the sums. */
export interface ChannelTotal {
  delta: number;
  trend: number[];
}

type SortKey = 'name' | 'spend' | 'leads' | 'cac' | 'roas' | 'delta' | 'share';

export interface ChannelTableProps {
  rows: ChannelRow[];
  onRowClick?: (key: ChannelName) => void;
  /**
   * Starts a conversation about THIS row.
   *
   * ⭐ The engine decides what to raise; this is how a reader raises something
   * themselves. Someone staring at a row is not asking "what should I do" -- they
   * are asking "what is going on here", and an agenda cannot answer a question it
   * did not anticipate.
   */
  onAskAbout?: (question: string, subject?: Target) => void;
  /** Chat open shrinks the content column, so the table drops its wide columns. */
  wideColumns?: boolean;
  /** The metric the change column measures. Decides whether a rise is good news. */
  metric?: DerivedMetric;
  /** The window the delta compares, for the header's explanation. */
  range?: number;
  /**
   * Lets the table change the metric itself. Passed on the Channels screen,
   * where the Δ and Trend columns followed a metric toggle that lives on
   * Overview -- invisible from here, so every row read "1%" with no way to see
   * or change what it was measuring. Not passed on Overview, where the chart's
   * own toggle directly above already does this.
   */
  onMetricChange?: (m: DerivedMetric) => void;
  /** Adds the "All channels" foot row. */
  total?: ChannelTotal;
}


const COLUMNS: { key: SortKey; label: string; wideOnly?: boolean; numeric?: boolean }[] = [
  { key: 'name',  label: 'Channel' },
  { key: 'spend', label: 'Spend', numeric: true },
  { key: 'leads', label: 'Leads', numeric: true },
  { key: 'cac',   label: 'CAC',  wideOnly: true, numeric: true },
  { key: 'roas',  label: 'ROAS', wideOnly: true, numeric: true },
  { key: 'delta', label: 'Δ Prev', numeric: true },
  /* Share of spend sits beside ROAS on purpose: together they answer "is the
     money going where the return is?" -- a channel with 38% of the budget and
     the lowest ROAS is the finding. Derived here from the rows, so it always
     sums to 100% of whatever channels are switched on. */
  { key: 'share', label: 'Share of spend', wideOnly: true, numeric: true },
];

export function ChannelTable({
  rows, onRowClick, onAskAbout, wideColumns = true, metric = 'Spend', range, onMetricChange, total,
}: ChannelTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'spend', dir: 'desc',
  });

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        // A new column starts descending for numbers and ascending for names,
        // because "biggest first" and "A first" are what people expect.
        : { key, dir: key === 'name' ? 'asc' : 'desc' });
  }

  const totalSpend = rows.reduce((t, r) => t + r.spend, 0);
  const withShare = rows.map((r) => ({ ...r, share: totalSpend > 0 ? r.spend / totalSpend : 0 }));

  const sorted = [...withShare].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'name') return a.name.localeCompare(b.name) * dir;
    const x = a[sort.key], y = b[sort.key];
    /* A channel that cannot report the metric sinks to the bottom either way --
       it has no position in the order, not the lowest one. */
    if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
    return (x - y) * dir;
  });

  /* The Δ header NAMES what it measures. "Δ Prev" over a column of "1%" said
     neither which metric nor against what. */
  const columns = COLUMNS
    .filter((c) => wideColumns || !c.wideOnly)
    .map((c) => (c.key === 'delta' ? { ...c, label: `Δ ${metric}` } : c));

  /* Summed, then divided once -- blended CAC is total spend over total leads,
     never the mean of six channel CACs. ROAS by the same rule, via revenue. */
  const sum = rows.reduce((a, r) => ({
    spend: a.spend + r.spend, leads: a.leads + r.leads, revenue: a.revenue + r.spend * r.roas,
  }), { spend: 0, leads: 0, revenue: 0 });

  return (
    <div className="gr-card">
      <header className="gr-card__header">
        <h3 className="gr-card__title gr-type-card-heading">Channels</h3>
        {onMetricChange && (
          <>
            <span className="gr-spacer" />
            {/* A select, not tabs: eleven metrics do not fit as a segmented
                control, and grouping them says what kind each one is. It
                drives the CHANGE column only -- the trend is always ROAS. */}
            <label className="gr-table__metric">
              <span className="gr-type-caption gr-table__metric-label">Change in</span>
              <select
                className="gr-table__select gr-type-label-button"
                value={metric}
                onChange={(e) => onMetricChange(e.target.value as DerivedMetric)}
              >
                <optgroup label="Volume">
                  {VOLUME.map((m) => <option key={m} value={m}>{m}</option>)}
                </optgroup>
                <optgroup label="Efficiency">
                  {EFFICIENCY.map((m) => <option key={m} value={m}>{m}</option>)}
                </optgroup>
              </select>
            </label>
          </>
        )}
      </header>

      <table className="gr-table">
        <thead>
          <tr className="gr-type-overline">
            {columns.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    title={c.key === 'delta' && range
                      ? `${metric}, ${rangePhrase(range)} against the ${range} days before` : undefined}>
                  <button type="button"
                          className={`gr-th ${active ? 'is-active' : ''}`}
                          onClick={() => toggleSort(c.key)}>
                    {c.label}
                    <span className="gr-th__arrow" aria-hidden="true">
                      {active ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                    </span>
                  </button>
                </th>
              );
            })}
            {/* ⭐ Always ROAS, whatever the change column shows. A trend line
                that re-plotted every time the metric changed made six rows of
                squiggles mean something different on each click; one fixed
                trend -- the return on the money -- reads the same every visit. */}
            <th scope="col" title="Return on ad spend over the selected range">ROAS trend</th>
            {/* An unlabelled column, because the button says what it does and a
                header reading "Ask" above six Ask buttons is noise. Named for
                assistive tech instead of visually. */}
            {onAskAbout && <th scope="col" className="gr-table__ask"><span className="gr-sr-only">Discuss</span></th>}
          </tr>
        </thead>
        <tbody>
          {/* A table with headers and no rows is not an empty state, it is a
              bug that looks like one. This was the third of three components
              the empty state never reached: the chart said "no spend recorded"
              directly above six populated rows, or below a table showing
              nothing at all with no explanation. */}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={wideColumns ? 9 : 6} className="gr-table__empty gr-type-body">
                No channels are switched on. Turn one back on in Settings to see spend here.
              </td>
            </tr>
          )}
          {sorted.map((r) => {
            return (
              /* Focusable AND activatable.

                 The row took focus and showed a ring, but Enter and Space did
                 nothing -- a keyboard user could reach every channel and open
                 none of them, while a mouse user drilled in by clicking. The
                 focus ring made it worse than a plainly inert row, because it
                 advertised an interaction that was not there.

                 role="button" so it announces as activatable rather than as a
                 row that mysteriously responds, and Space is preventDefault'd
                 because its default action is to scroll the page. */
              <tr
                key={r.key}
                className="gr-table__row"
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick ? `Open ${r.name}` : undefined}
                onClick={() => onRowClick?.(r.key)}
                onKeyDown={(e) => {
                  if (!onRowClick) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(r.key);
                  }
                }}
              >
                <td className="gr-cell--name">
                  <span className="gr-table__channel gr-type-body-medium">
                    <ChannelMark channel={r.key} size={16} />
                    <span className="gr-table__name">
                      {r.name}
                      {r.sub && <span className="gr-table__sub gr-type-caption">{r.sub}</span>}
                    </span>
                  </span>
                </td>
                {/* Each figure carries its own label, shown only when the row is a
                    card (a phone): with the header row gone, "$18,400" alone
                    does not say it is spend. aria-hidden -- the column header
                    already names it for a screen reader. */}
                <td className="gr-type-body gr-cell--spend"><span className="gr-table__label gr-type-caption" aria-hidden="true">Spend</span>{formatMetric('Spend', r.spend)}</td>
                <td className="gr-type-body gr-cell--leads"><span className="gr-table__label gr-type-caption" aria-hidden="true">Leads</span>{formatMetric('Leads', r.leads)}</td>
                {wideColumns && <td className="gr-type-body gr-cell--cac"><span className="gr-table__label gr-type-caption" aria-hidden="true">CAC</span>{formatMetric('CAC', r.cac)}</td>}
                {wideColumns && <td className="gr-type-body gr-cell--roas"><span className="gr-table__label gr-type-caption" aria-hidden="true">ROAS</span>{formatMetric('ROAS', r.roas)}</td>}
                <td className="gr-cell--delta">
                  {/* Instanced, not redrawn. This cell used to own a second
                      copy of the arrow-and-colour logic, so a fix to one never
                      reached the other. */}
                  {/* higherIsBetter was never passed here, so it defaulted to true
                      and a rising CAC rendered GREEN in this column while the KPI
                      card above rendered the same number red. */}
                  {r.delta === null ? (
                    <span className="gr-type-caption gr-table__na"
                          title={`${r.name} does not report ${metric}`}>—</span>
                  ) : (
                    <DeltaBadge percent={r.delta} higherIsBetter={betterHigher(metric)} bare />
                  )}
                </td>
                {wideColumns && (
                  <td className="gr-cell--share">
                    <span className="gr-share">
                      <span className="gr-share__value gr-type-body">{Math.round(r.share * 100)}%</span>
                      <span className="gr-share__track" aria-hidden="true">
                        <span className="gr-share__fill"
                              /* The track is 100% of spend, so the bar is the true share:
                                 38% fills 38% of the track. Scaling to the largest
                                 share made Meta's 38% look like the whole budget. */
                              style={{ width: `${r.share * 100}%`,
                                       background: channelGradient(r.key) }} />
                      </span>
                    </span>
                  </td>
                )}
                <td className="gr-cell--trend">
                  <Sparkline values={r.trend} channel={r.key} variant="line" height={20} />
                </td>
                {onAskAbout && (
                  <td className="gr-table__ask gr-type-caption-med">
                    {/* Revealed on row hover and on keyboard focus -- always
                        visible it becomes six identical buttons competing with the
                        numbers, which is what the row is for. */}
                    <button
                      type="button"
                      className="gr-unbutton gr-ask"
                      aria-label={`Ask about ${r.name}`}
                      onClick={(e) => {
                        /* The row navigates. This must not, or asking about a
                           channel would also leave the screen you asked from. */
                        e.stopPropagation();
                        onAskAbout(`What’s going on with ${r.name}?`,
                          { kind: 'channel', id: r.key, label: r.name });
                      }}
                    >
                      Ask
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {/* ⭐ What the rows add up to. A channel table with no total asked the
            reader to sum six spends in their head to know what 38% was 38% OF. */}
        {total && rows.length > 1 && (
          <tfoot>
            <tr className="gr-table__total">
              <th scope="row" className="gr-type-body-medium gr-cell--name">All channels</th>
              <td className="gr-type-body-medium gr-cell--spend"><span className="gr-table__label gr-type-caption" aria-hidden="true">Spend</span>{formatMetric('Spend', sum.spend)}</td>
              <td className="gr-type-body-medium gr-cell--leads"><span className="gr-table__label gr-type-caption" aria-hidden="true">Leads</span>{formatMetric('Leads', sum.leads)}</td>
              {wideColumns && (
                <td className="gr-type-body-medium gr-cell--cac">
                  <span className="gr-table__label gr-type-caption" aria-hidden="true">CAC</span>{formatMetric('CAC', sum.leads > 0 ? sum.spend / sum.leads : 0)}
                </td>
              )}
              {wideColumns && (
                <td className="gr-type-body-medium gr-cell--roas">
                  <span className="gr-table__label gr-type-caption" aria-hidden="true">ROAS</span>{formatMetric('ROAS', sum.spend > 0 ? sum.revenue / sum.spend : 0)}
                </td>
              )}
              <td className="gr-cell--delta"><DeltaBadge percent={total.delta} higherIsBetter={betterHigher(metric)} bare /></td>
              {wideColumns && <td className="gr-type-body-medium gr-cell--share">100%</td>}
              <td className="gr-cell--trend"><Sparkline values={total.trend} channel="all" variant="line" height={20} /></td>
              {onAskAbout && <td />}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
