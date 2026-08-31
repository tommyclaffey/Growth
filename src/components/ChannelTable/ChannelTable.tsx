import { useState } from 'react';
import './ChannelTable.css';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { formatMetric, type Metric } from '../../data/metrics';
import { DeltaBadge } from '../DeltaBadge/DeltaBadge';
import { Sparkline } from '../Sparkline/Sparkline';
import type { ChannelName } from '../../styles/tokens';

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
  delta: number;
  trend: number[];
}

type SortKey = 'name' | 'spend' | 'leads' | 'cac' | 'roas' | 'delta';

export interface ChannelTableProps {
  rows: ChannelRow[];
  onRowClick?: (key: ChannelName) => void;
  /** Chat open shrinks the content column, so the table drops its wide columns. */
  wideColumns?: boolean;
  /** The metric the trend column is showing, so the mark can follow the rule. */
  metric?: Metric;
}


const COLUMNS: { key: SortKey; label: string; wideOnly?: boolean; numeric?: boolean }[] = [
  { key: 'name',  label: 'Channel' },
  { key: 'spend', label: 'Spend', numeric: true },
  { key: 'leads', label: 'Leads', numeric: true },
  { key: 'cac',   label: 'CAC',  wideOnly: true, numeric: true },
  { key: 'roas',  label: 'ROAS', wideOnly: true, numeric: true },
  { key: 'delta', label: 'Δ Prev', numeric: true },
];

export function ChannelTable({ rows, onRowClick, wideColumns = true, metric }: ChannelTableProps) {
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

  const sorted = [...rows].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'name') return a.name.localeCompare(b.name) * dir;
    return (a[sort.key] - b[sort.key]) * dir;
  });

  const columns = COLUMNS.filter((c) => wideColumns || !c.wideOnly);

  return (
    <div className="gr-card">
      <header className="gr-card__header">
        <h3 className="gr-card__title gr-type-card-heading">Channels</h3>
      </header>

      <table className="gr-table">
        <thead>
          <tr className="gr-type-overline">
            {columns.map((c) => {
              const active = sort.key === c.key;
              return (
                <th key={c.key} scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
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
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            return (
              <tr key={r.key} className="gr-table__row" onClick={() => onRowClick?.(r.key)} tabIndex={0}>
                <td>
                  <span className="gr-table__channel gr-type-body-medium">
                    <ChannelMark channel={r.key} size={16} />
                    {r.name}
                  </span>
                </td>
                <td className="gr-type-body">{formatMetric('Spend', r.spend)}</td>
                <td className="gr-type-body">{formatMetric('Leads', r.leads)}</td>
                {wideColumns && <td className="gr-type-body">{formatMetric('CAC', r.cac)}</td>}
                {wideColumns && <td className="gr-type-body">{formatMetric('ROAS', r.roas)}</td>}
                <td>
                  {/* Instanced, not redrawn. This cell used to own a second
                      copy of the arrow-and-colour logic, so a fix to one never
                      reached the other. */}
                  <DeltaBadge percent={r.delta} bare />
                </td>
                <td>
                  <Sparkline values={r.trend} metric={metric} channel={r.key} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
