import './screens.css';
import { Button } from '../components/Button/Button';
import { StatusPill, type Stage } from '../components/StatusPill/StatusPill';
import { Badge } from '../components/Badge/Badge';

interface Report {
  id: string;
  name: string;
  scope: string;
  cadence: string;
  recipients: number;
  lastRun: string;
  stage: Stage;
}

const REPORTS: Report[] = [
  { id: 'r1', name: 'Weekly performance summary', scope: 'All channels',        cadence: 'Every Monday, 8:00',   recipients: 6, lastRun: 'Aug 24', stage: 'Active' },
  { id: 'r2', name: 'Meta deep dive',             scope: 'Meta',                cadence: 'Every Friday, 16:00',  recipients: 3, lastRun: 'Aug 22', stage: 'Active' },
  { id: 'r3', name: 'Creator channel blended',    scope: 'TikTok · YouTube',    cadence: 'Monthly, 1st',         recipients: 4, lastRun: 'Aug 1',  stage: 'Active' },
  { id: 'r4', name: 'CAC watch',                  scope: 'All channels',        cadence: 'Daily, 7:00',          recipients: 2, lastRun: 'Aug 26', stage: 'Paused' },
  { id: 'r5', name: 'Q3 board pack',              scope: 'All channels',        cadence: 'Quarterly',            recipients: 9, lastRun: '—',      stage: 'Draft' },
];

export function Reports() {
  return (
    <>
      <header className="gr-section-head">
        <span className="gr-spacer" />
        <Button variant="ghost">Export now</Button>
        <Button variant="primary">New report</Button>
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
            </tr>
          </thead>
          <tbody>
            {REPORTS.map((r) => (
              <tr key={r.id} className="gr-table__row" tabIndex={0}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
