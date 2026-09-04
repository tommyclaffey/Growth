import {
  CHANNEL_LABEL, activeChannels, rows, totals,
  type Range, type Scope,
} from './metrics';
import { workspaceName } from './profile';
import type { ChannelName } from '../styles/tokens';

/**
 * Export the current view as CSV.
 *
 * Built client-side from the same functions the screen renders from, so the
 * file and the dashboard can never disagree. Exporting from a second code
 * path is how a report ends up saying something the UI never showed.
 *
 * CAC and ROAS are written out as computed values rather than recomputed by
 * whoever opens the file — the ratio has to come from the same place as the
 * numbers on screen.
 */

const HEADERS = [
  'Period', 'Channel', 'Spend', 'Clicks', 'Leads', 'Sales', 'Revenue', 'CAC', 'ROAS',
];

function escape(value: string | number): string {
  const s = String(value);
  // Quote anything containing a comma, quote or newline; double any quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function line(cells: (string | number)[]): string {
  return cells.map(escape).join(',');
}

export function buildCsv(scope: Scope, range: Range): string {
  const scopes: (ChannelName | 'all')[] = scope === 'all' ? activeChannels() : [scope];
  const out: string[] = [line(HEADERS)];

  for (const s of scopes) {
    const label = s === 'all' ? 'All channels' : CHANNEL_LABEL[s as ChannelName];
    for (const r of rows(s, range)) {
      out.push(line([
        r.label,
        label,
        r.spend.toFixed(2),
        Math.round(r.clicks),
        Math.round(r.leads),
        Math.round(r.sales),
        r.revenue.toFixed(2),
        r.leads > 0 ? (r.spend / r.leads).toFixed(2) : '',
        r.spend > 0 ? (r.revenue / r.spend).toFixed(2) : '',
      ]));
    }
  }

  // A totals row, because the first thing anyone does with this file is sum it.
  const t = totals(scope, range);
  out.push(line([
    `Total (${range} days)`,
    scope === 'all' ? 'All channels' : CHANNEL_LABEL[scope as ChannelName],
    t.spend.toFixed(2),
    Math.round(t.clicks),
    Math.round(t.leads),
    Math.round(t.sales),
    t.revenue.toFixed(2),
    t.cac.toFixed(2),
    t.roas.toFixed(2),
  ]));

  return out.join('\n');
}

export function downloadCsv(scope: Scope, range: Range): void {
  const csv = buildCsv(scope, range);
  const workspace = workspaceName().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const name = scope === 'all' ? 'all-channels' : scope.toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  /* The workspace name, not a hardcoded "growth-". This literal is what
     made the Settings hint false for exports. */
  a.download = `${workspace}-${name}-${range}d-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Without this the blob stays in memory for the life of the tab.
  URL.revokeObjectURL(url);
}
