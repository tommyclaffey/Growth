import './ChannelTable.css';
import type { ChannelName } from '../../styles/tokens';

export interface ChannelRow {
  key: ChannelName;
  name: string;
  spend: string;
  leads: string;
  cac: string;
  roas: string;
  delta: number;
  trend: number[];
}

export interface ChannelTableProps {
  rows: ChannelRow[];
  onRowClick?: (key: ChannelName) => void;
  /** Chat open shrinks the content column, so the table drops its wide columns. */
  wideColumns?: boolean;
}

const CSS_CHANNEL: Record<string, string> = {
  meta: 'meta', tiktok: 'tiktok', youtube: 'youtube',
  affiliates: 'affiliates', paidSearch: 'paid-search', podcasts: 'podcasts',
};

/**
 * Channels table.
 *
 * Each row carries a channel dot in channel/<name>. The dot is never the only
 * signal — the channel name sits right beside it, which is what makes the
 * colour-only accessibility concern a non-issue here.
 *
 * wideColumns mirrors the Figma prototype variable of the same name: when the
 * chat panel opens the content column goes 1280 to 920 and CAC and ROAS drop
 * out rather than squeezing.
 */
export function ChannelTable({ rows, onRowClick, wideColumns = true }: ChannelTableProps) {
  return (
    <div className="gr-card">
      <header className="gr-card__header">
        <h3 className="gr-card__title gr-type-card-heading">Channels</h3>
        <button type="button" className="gr-card__sort gr-type-label-button">
          Sort: Spend
          <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
            <path d="M1 1L4 4L7 1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      <table className="gr-table">
        <thead>
          <tr className="gr-type-overline">
            <th scope="col">Channel</th>
            <th scope="col">Spend</th>
            <th scope="col">Leads</th>
            {wideColumns && <th scope="col">CAC</th>}
            {wideColumns && <th scope="col">ROAS</th>}
            <th scope="col">Δ Prev</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const up = r.delta >= 0;
            return (
              <tr key={r.key} className="gr-table__row" onClick={() => onRowClick?.(r.key)} tabIndex={0}>
                <td>
                  <span className="gr-table__channel gr-type-body-medium">
                    <span
                      className="gr-table__dot"
                      style={{ background: `var(--channel-${CSS_CHANNEL[r.key] ?? r.key})` }}
                      aria-hidden="true"
                    />
                    {r.name}
                  </span>
                </td>
                <td className="gr-type-body">{r.spend}</td>
                <td className="gr-type-body">{r.leads}</td>
                {wideColumns && <td className="gr-type-body">{r.cac}</td>}
                {wideColumns && <td className="gr-type-body">{r.roas}</td>}
                <td>
                  <span className={`gr-table__delta gr-type-caption-med ${up ? 'is-up' : 'is-down'}`}>
                    {up ? '↑' : '↓'} {Math.abs(r.delta)}%
                  </span>
                </td>
                <td>
                  <span className="gr-table__spark" aria-hidden="true">
                    {r.trend.map((h, i) => (
                      <span key={i} className="gr-table__spark-bar" style={{ height: `${Math.max(0.2, h) * 14}px` }} />
                    ))}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
