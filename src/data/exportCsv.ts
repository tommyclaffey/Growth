import {
  CHANNEL_LABEL, activeChannels, canProduce, rows, totals,
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

/**
 * A field the channel cannot produce is written BLANK, not zero.
 *
 * 🚨 G-011's escape hatch. Every other surface asks `CHANNEL_METRICS` what a
 * channel may display, so a podcast never showed a click. The export asked
 * nothing and wrote the raw row — so a spreadsheet left this product carrying a
 * podcast click count, which is the one place the fiction became a document
 * someone else could act on.
 *
 * ⚠️ Blank rather than 0, and the difference matters more here than on screen. In
 * a spreadsheet a zero is a value: it sums, it averages, and it drags a CTR
 * column down as though the ad performed badly. **An empty cell is excluded from
 * both.** Zero says "we measured none"; blank says "there is nothing to measure",
 * and only the second one is true.
 */
function fieldOrBlank(
  scope: ChannelName | 'all', field: 'clicks' | 'impressions', value: number,
): string | number {
  if (scope === 'all') return Math.round(value);
  return canProduce(scope, field) ? Math.round(value) : '';
}

function escape(value: string | number): string {
  const s = String(value);
  // Quote anything containing a comma, quote or newline; double any quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function line(cells: (string | number)[]): string {
  return cells.map(escape).join(',');
}

/**
 * A scope, or an explicit SET of channels.
 *
 * 🐛 The set exists because Reports had a row reading "TikTok · YouTube" whose
 * Export ran `'tiktok'` -- a Scope can name one channel or all of them, and
 * nothing in between. The label described two channels and the file held one.
 */
export type ExportScope = Scope | ChannelName[];

function sumTotals(channels: ChannelName[], range: Range) {
  const s = channels.map((c) => totals(c, range)).reduce(
    (a, t) => ({
      spend: a.spend + t.spend, clicks: a.clicks + t.clicks, leads: a.leads + t.leads,
      sales: a.sales + t.sales, revenue: a.revenue + t.revenue,
    }),
    { spend: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 },
  );
  /* Summed first, divided once -- the rule every total in this product follows. */
  return { ...s, cac: s.leads > 0 ? s.spend / s.leads : 0, roas: s.spend > 0 ? s.revenue / s.spend : 0 };
}

export function buildCsv(scope: ExportScope, range: Range): string {
  const scopes: (ChannelName | 'all')[] = Array.isArray(scope)
    ? scope : scope === 'all' ? activeChannels() : [scope];
  const out: string[] = [line(HEADERS)];

  for (const s of scopes) {
    const label = s === 'all' ? 'All channels' : CHANNEL_LABEL[s as ChannelName];
    for (const r of rows(s, range)) {
      out.push(line([
        r.label,
        label,
        r.spend.toFixed(2),
        fieldOrBlank(s, 'clicks', r.clicks),
        Math.round(r.leads),
        Math.round(r.sales),
        r.revenue.toFixed(2),
        r.leads > 0 ? (r.spend / r.leads).toFixed(2) : '',
        r.spend > 0 ? (r.revenue / r.spend).toFixed(2) : '',
      ]));
    }
  }

  // A totals row, because the first thing anyone does with this file is sum it.
  const t = Array.isArray(scope) ? sumTotals(scope, range) : totals(scope, range);
  const totalLabel = Array.isArray(scope)
    ? scope.map((c) => CHANNEL_LABEL[c]).join(' + ')
    : scope === 'all' ? 'All channels' : CHANNEL_LABEL[scope as ChannelName];
  /* A set sums like the blend does -- a channel with no clicks contributes 0 to
     a total that is still real for the others. Blank only for a lone channel
     that cannot produce the field at all. */
  const clicksCell = Array.isArray(scope)
    ? (scope.length === 1 ? fieldOrBlank(scope[0], 'clicks', t.clicks) : Math.round(t.clicks))
    : fieldOrBlank(scope, 'clicks', t.clicks);
  out.push(line([
    `Total (${range} days)`,
    totalLabel,
    t.spend.toFixed(2),
    clicksCell,
    Math.round(t.leads),
    Math.round(t.sales),
    t.revenue.toFixed(2),
    t.cac.toFixed(2),
    t.roas.toFixed(2),
  ]));

  return out.join('\n');
}

export function downloadCsv(scope: ExportScope, range: Range, fileLabel?: string): void {
  const csv = buildCsv(scope, range);
  const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const workspace = slug(workspaceName());
  const name = fileLabel ? slug(fileLabel)
    : Array.isArray(scope) ? scope.map((c) => c.toLowerCase()).join('-')
    : scope === 'all' ? 'all-channels' : scope.toLowerCase();
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
