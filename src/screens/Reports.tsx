import { Fragment, useState } from 'react';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Chip } from '../components/Chip/Chip';
import { Avatar } from '../components/Avatar/Avatar';
import { ChannelMark } from '../components/ChannelMark/ChannelMark';
import { DeltaBadge } from '../components/DeltaBadge/DeltaBadge';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { Badge } from '../components/Badge/Badge';
import { downloadCsv } from '../data/exportCsv';
import { useChannels } from '../data/channels';
import { MEMBERS } from '../data/chat';
import { blendedDelta } from '../data/blended';
import { formatDerived } from '../data/channelMetrics';
import {
  CHANNEL_LABEL, DAY_LABELS, delta, formatMetric, totals, type Range,
} from '../data/metrics';
import type { ChannelName } from '../styles/tokens';
import {
  WINDOW, addReport, exportChannels, formatRun, nextRun, removeReport, scopeLabel,
  setReportStage, useReports, type Cadence, type Report,
} from '../data/reports';

const CADENCES: Cadence[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];

/** "Covers the last 7 days" -- what the file will actually hold. */
function covers(r: Report): string {
  return r.cadence === 'Daily'
    ? 'Trailing 7 days, sent daily'
    : `Covers the last ${WINDOW[r.cadence]} days`;
}

/** "Aug 6 – Aug 12". `back` = 1 for the window before it. */
function windowLabel(range: Range, back = 0): string {
  const end = DAY_LABELS.length - back * range;
  return `${DAY_LABELS[end - range]} – ${DAY_LABELS[end - 1]}`;
}

/**
 * Scheduled reports.
 *
 * ⭐ A report is a PROMISE to send certain numbers to certain people on a
 * schedule. The screen used to show the promise and nothing it contained, so
 * the only way to know what "Weekly performance summary" said was to export it
 * and open a spreadsheet. Preview shows the actual figures, built from the same
 * functions as the CSV, so the preview and the file cannot disagree.
 */
export function Reports() {
  const list = useReports();
  const active = useChannels();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  /* The summary is derived from the list, not stored beside it. */
  const running = list.filter((r) => r.stage === 'Active');
  const upcoming = running
    .map((r) => ({ r, at: nextRun(r) }))
    .filter((x): x is { r: Report; at: Date } => x.at !== undefined)
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  const people = new Set(list.flatMap((r) => (r.stage === 'Draft' ? [] : r.recipients)));

  return (
    <>
      <header className="gr-section-head">
        <span className="gr-spacer" />
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>New report</Button>
        )}
      </header>

      <dl className="gr-report-summary">
        <div className="gr-card gr-report-stat">
          <dt className="gr-type-overline">Sending</dt>
          <dd className="gr-type-card-heading">
            {running.length} of {list.length} reports
          </dd>
        </div>
        <div className="gr-card gr-report-stat">
          <dt className="gr-type-overline">Next send</dt>
          <dd>
            {upcoming ? (
              <>
                <span className="gr-type-card-heading">{formatRun(upcoming.at)}</span>
                <span className="gr-type-caption gr-report-stat__sub">{upcoming.r.name}</span>
              </>
            ) : <span className="gr-type-card-heading">Nothing scheduled</span>}
          </dd>
        </div>
        <div className="gr-card gr-report-stat">
          <dt className="gr-type-overline">Your team receiving</dt>
          <dd className="gr-report-people">
            {[...people].map((id) => MEMBERS[id]).filter(Boolean).map((m) => (
              <Avatar key={m.id} initials={m.initials} hue={m.hue} src={m.avatar} name={m.name} size={24} />
            ))}
          </dd>
        </div>
      </dl>

      {creating && <NewReport active={active} onDone={() => setCreating(false)} />}

      <div className="gr-card">
        <table className="gr-table">
          <thead>
            <tr className="gr-type-overline">
              <th scope="col">Report</th>
              <th scope="col">Schedule</th>
              <th scope="col">Recipients</th>
              <th scope="col">Status</th>
              <th scope="col">Next run</th>
              <th scope="col"><span className="gr-sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const run = exportChannels(r, active);
              const next = nextRun(r);
              const isOpen = open === r.id;
              const panel = `report-preview-${r.id}`;
              return (
                <Fragment key={r.id}>
                  <tr className={`gr-report-row ${isOpen ? 'is-open' : ''}`}>
                    <td>
                      <span className="gr-report-name">
                        <strong className="gr-type-body-medium">{r.name}</strong>
                        {/* Derived from the channels the export runs -- never
                            typed separately, so it cannot describe a different file. */}
                        <span className="gr-type-caption">{scopeLabel(r)}</span>
                      </span>
                    </td>
                    <td>
                      <span className="gr-report-name">
                        <span className="gr-type-body gr-report-when">{r.when}</span>
                        <span className="gr-type-caption">{covers(r)}</span>
                      </span>
                    </td>
                    <td>
                      <span className="gr-report-people">
                        {r.recipients.map((id) => MEMBERS[id]).filter(Boolean).map((m) => (
                          <Avatar key={m.id} initials={m.initials} hue={m.hue} src={m.avatar}
                                  name={m.name} size={24} />
                        ))}
                        {r.external ? (
                          <span className="gr-report-more gr-type-caption-med"
                                title={`${r.external} outside your workspace`}>
                            +{r.external}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td><StatusPill stage={r.stage} /></td>
                    <td>
                      <span className="gr-report-name">
                        <span className="gr-type-body gr-report-when">
                          {next ? formatRun(next)
                            : r.stage === 'Paused' ? 'Paused' : 'Not scheduled'}
                        </span>
                        {r.lastRun
                          ? <span className="gr-type-caption">Last sent {r.lastRun}</span>
                          : <Badge label="Never run" tone="neutral" />}
                      </span>
                    </td>
                    <td className="gr-report-actions">
                      <Button variant="ghost" className="gr-report-toggle"
                              aria-expanded={isOpen} aria-controls={panel}
                              onClick={() => setOpen(isOpen ? null : r.id)}
                              aria-label={`${isOpen ? 'Hide preview of' : 'Preview'} ${r.name}`}>
                        {isOpen ? 'Hide' : 'Preview'}
                      </Button>
                      {run ? (
                        <Button variant="ghost"
                                onClick={() => downloadCsv(run, WINDOW[r.cadence], r.name)}>
                          Export
                        </Button>
                      ) : (
                        /* Said, not just disabled -- a consequence of a setting
                           the reader can go and change. */
                        <span className="gr-type-caption gr-report-off">
                          {scopeLabel(r)} switched off
                        </span>
                      )}
                    </td>
                  </tr>

                  {isOpen && (
                    <tr className="gr-report-preview-row">
                      <td colSpan={6} id={panel}>
                        <Preview report={r} channels={run} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * What the report would send today -- per channel, over its own window, against
 * the window before it. Plus the controls that change the report itself, kept
 * here rather than crowding every row with four buttons.
 */
function Preview({ report: r, channels }: { report: Report; channels: ChannelName[] | null }) {
  const range = WINDOW[r.cadence];

  return (
    <div className="gr-report-preview">
      <header className="gr-report-preview__head">
        <div>
          <p className="gr-type-card-heading gr-report-preview__title">What this sends</p>
          <p className="gr-type-caption gr-report-preview__sub">
            {windowLabel(range)}, compared with {windowLabel(range, 1)}
          </p>
        </div>
        <span className="gr-spacer" />
        {r.stage === 'Active' && (
          <Button variant="ghost" onClick={() => setReportStage(r.id, 'Paused')}>Pause</Button>
        )}
        {r.stage === 'Paused' && (
          <Button variant="ghost" onClick={() => setReportStage(r.id, 'Active')}>Resume</Button>
        )}
        {r.stage === 'Draft' && (
          <Button variant="primary" onClick={() => setReportStage(r.id, 'Active')}>Schedule it</Button>
        )}
        {r.own && (
          <Button variant="ghost" onClick={() => removeReport(r.id)}
                  aria-label={`Remove ${r.name}`}>
            Remove
          </Button>
        )}
      </header>

      {channels ? (
        <table className="gr-table gr-report-preview__table">
          <thead>
            <tr className="gr-type-overline">
              <th scope="col">Channel</th>
              <th scope="col">Spend</th>
              <th scope="col">Leads</th>
              <th scope="col">CAC</th>
              <th scope="col">ROAS</th>
              <th scope="col">CAC vs prior</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => {
              const t = totals(c, range);
              return (
                <tr key={c}>
                  <td>
                    <span className="gr-ads__channel">
                      <ChannelMark channel={c} size={16} />
                      <span className="gr-type-body">{CHANNEL_LABEL[c]}</span>
                    </span>
                  </td>
                  <td className="gr-type-body">{formatMetric('Spend', t.spend)}</td>
                  <td className="gr-type-body">{Math.round(t.leads).toLocaleString()}</td>
                  <td className="gr-type-body">{formatDerived('CAC', t.cac)}</td>
                  <td className="gr-type-body">{formatDerived('ROAS', t.roas)}</td>
                  <td><DeltaBadge percent={delta(c, 'CAC', range)} higherIsBetter={false} /></td>
                </tr>
              );
            })}
            {channels.length > 1 && <TotalRow channels={channels} range={range} />}
          </tbody>
        </table>
      ) : (
        <p className="gr-type-body gr-report-off">
          Every channel in this report is switched off, so there is nothing to send.
        </p>
      )}
    </div>
  );
}

/** Summed, then divided once -- the same rule as the CSV's totals row. */
function TotalRow({ channels, range }: { channels: ChannelName[]; range: Range }) {
  const s = channels.map((c) => totals(c, range)).reduce(
    (a, t) => ({ spend: a.spend + t.spend, leads: a.leads + t.leads, revenue: a.revenue + t.revenue }),
    { spend: 0, leads: 0, revenue: 0 },
  );
  return (
    <tr className="gr-report-preview__total">
      <td className="gr-type-body-medium">Total</td>
      <td className="gr-type-body-medium">{formatMetric('Spend', s.spend)}</td>
      <td className="gr-type-body-medium">{Math.round(s.leads).toLocaleString()}</td>
      <td className="gr-type-body-medium">{formatDerived('CAC', s.leads > 0 ? s.spend / s.leads : 0)}</td>
      <td className="gr-type-body-medium">{formatDerived('ROAS', s.spend > 0 ? s.revenue / s.spend : 0)}</td>
      <td><DeltaBadge percent={blendedDelta('CAC', channels, range)} higherIsBetter={false} /></td>
    </tr>
  );
}

/**
 * The report builder, at its smallest: what, which channels, how often, to whom.
 *
 * It was a disabled primary button -- the loudest control on the screen, doing
 * nothing. Inline rather than a modal: a modal needs a focus trap this product
 * does not have yet (Phase 2), and a form in the page needs none.
 */
function NewReport({ active, onDone }: { active: ChannelName[]; onDone: () => void }) {
  const [name, setName] = useState('');
  const [channels, setChannels] = useState<ChannelName[]>([]);
  const [cadence, setCadence] = useState<Cadence>('Weekly');
  const [people, setPeople] = useState<string[]>([]);

  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const ready = name.trim().length > 0 && people.length > 0;

  return (
    <form
      className="gr-card gr-report-form"
      aria-label="New report"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        addReport({ name: name.trim(), channels, cadence, recipients: people });
        onDone();
      }}
    >
      <h3 className="gr-type-card-heading gr-report-form__title">New report</h3>

      <label className="gr-report-form__row">
        <span className="gr-type-label-field">Name</span>
        <input className="gr-report-form__input gr-type-body" value={name} autoFocus
               placeholder="e.g. Monday paid social check-in"
               onChange={(e) => setName(e.target.value)} />
      </label>

      <fieldset className="gr-report-form__row">
        <legend className="gr-type-label-field">Channels</legend>
        <div className="gr-report-form__chips">
          <Chip label="All channels" pressed={channels.length === 0} onClick={() => setChannels([])} />
          {active.map((c) => (
            <Chip key={c} label={CHANNEL_LABEL[c]} pressed={channels.includes(c)}
                  onClick={() => setChannels(toggle(channels, c))} />
          ))}
        </div>
      </fieldset>

      <fieldset className="gr-report-form__row">
        <legend className="gr-type-label-field">How often</legend>
        <div className="gr-report-form__chips">
          {CADENCES.map((c) => (
            <Chip key={c} label={c} pressed={cadence === c} onClick={() => setCadence(c)} />
          ))}
        </div>
        <span className="gr-type-caption gr-report-form__hint">
          {cadence === 'Daily' ? 'Each one covers the trailing 7 days.'
            : `Each one covers the last ${WINDOW[cadence]} days.`}
        </span>
      </fieldset>

      <fieldset className="gr-report-form__row">
        <legend className="gr-type-label-field">Send to</legend>
        <div className="gr-report-form__chips">
          {Object.values(MEMBERS).map((m) => (
            <Chip key={m.id} label={m.name} pressed={people.includes(m.id)}
                  onClick={() => setPeople(toggle(people, m.id))} />
          ))}
        </div>
      </fieldset>

      <footer className="gr-report-form__actions">
        {/* Enabled only when it can succeed, and the reason is on screen when
            it cannot -- rather than a click that silently does nothing. */}
        <Button variant="primary" type="submit" disabled={!ready}>Create report</Button>
        <Button variant="ghost" type="button" onClick={onDone}>Cancel</Button>
        {!ready && (
          <span className="gr-type-caption gr-report-form__hint">
            {name.trim() ? 'Pick at least one person to send it to.' : 'Give it a name.'}
          </span>
        )}
      </footer>
    </form>
  );
}
