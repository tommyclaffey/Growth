import './screens.css';
import { Button } from '../components/Button/Button';
import { StatusPill, type Stage } from '../components/StatusPill/StatusPill';
import { Badge } from '../components/Badge/Badge';
import { downloadCsv } from '../data/exportCsv';
import type { Scope } from '../data/metrics';

interface Report {
  id: string;
  name: string;
  /** What the row says. */
  scope: string;
  /** What Export actually runs. A label is not a query. */
  scopeKey: Scope;
  cadence: string;
  recipients: number;
  lastRun: string;
  stage: Stage;
}

const REPORTS: Report[] = [
  { id: 'r1', name: 'Weekly performance summary', scope: 'All channels', scopeKey: 'all',        cadence: 'Every Monday, 8:00',   recipients: 6, lastRun: 'Aug 24', stage: 'Active' },
  { id: 'r2', name: 'Meta deep dive',             scope: 'Meta', scopeKey: 'meta',                cadence: 'Every Friday, 16:00',  recipients: 3, lastRun: 'Aug 22', stage: 'Active' },
  { id: 'r3', name: 'Creator channel blended',    scope: 'TikTok · YouTube', scopeKey: 'tiktok',    cadence: 'Monthly, 1st',         recipients: 4, lastRun: 'Aug 1',  stage: 'Active' },
  { id: 'r4', name: 'CAC watch',                  scope: 'All channels', scopeKey: 'all',        cadence: 'Daily, 7:00',          recipients: 2, lastRun: 'Aug 26', stage: 'Paused' },
  { id: 'r5', name: 'Q3 board pack',              scope: 'All channels', scopeKey: 'all',        cadence: 'Quarterly',            recipients: 9, lastRun: '—',      stage: 'Draft' },
];

export function Reports() {
  return (
    <>
      <header className="gr-section-head">
        <span className="gr-spacer" />
        <Button variant="ghost" onClick={() => downloadCsv('all', 30)}>Export now</Button>
        {/* Creating a report needs a builder flow that does not exist here.
            Disabled and labelled, rather than shipped as a button that lies. */}
        <Button variant="primary" disabled title="Report builder is out of scope for this prototype">
          New report
        </Button>
      </header>

      <div className="gr-card">
        <table className="gr-table">
          <thead>
            <tr className="gr-type-overline">
              <th scope="col">Report</th>
              <th scope="col">Schedule</th>
              <th scope="col">Recipients</th>
              <th scope="col">Status</th>
              <th scope="col">Last run</th>
              <th scope="col"><span className="gr-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
              {/* No tabIndex and no gr-table__row.

                  The row was focusable, took a focus ring, showed a pointer
                  cursor and a hover background -- and had no handler. Five
                  controls that looked live and did nothing, on the thinnest
                  screen in the product. An affordance is a promise.

                  The fix is a real action rather than a quieter row: Export
                  runs this report's actual scope, so the control does the thing
                  its label says. */}
            {REPORTS.map((r) => (
              <tr key={r.id} className="gr-report-row">
                <td>
                  <span className="gr-report-name">
                    <strong className="gr-type-body-medium">{r.name}</strong>
                    <span className="gr-type-caption">{r.scope}</span>
                  </span>
                </td>
                <td className="gr-type-body">{r.cadence}</td>
                <td className="gr-type-body">{r.recipients}</td>
                <td><StatusPill stage={r.stage} /></td>
                <td>
                  {r.lastRun === '—'
                    ? <Badge label="Never run" tone="neutral" />
                    : <span className="gr-type-body">{r.lastRun}</span>}
                </td>
                <td className="gr-report-actions">
                  <Button variant="ghost" onClick={() => downloadCsv(r.scopeKey, 30)}>
                    Export
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
