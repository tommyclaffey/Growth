import { useState } from 'react';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Chip } from '../components/Chip/Chip';
import { Avatar } from '../components/Avatar/Avatar';
import { StatusPill } from '../components/StatusPill/StatusPill';
import { Badge } from '../components/Badge/Badge';
import { downloadCsv } from '../data/exportCsv';
import { useChannels } from '../data/channels';
import { MEMBERS } from '../data/chat';
import { CHANNEL_LABEL } from '../data/metrics';
import type { ChannelName } from '../styles/tokens';
import {
  WINDOW, addReport, exportChannels, removeReport, scopeLabel, useReports,
  type Cadence, type Report,
} from '../data/reports';

const CADENCES: Cadence[] = ['Daily', 'Weekly', 'Monthly', 'Quarterly'];

/** "Covers the last 7 days" -- what the file will actually hold. */
function covers(r: Report): string {
  return r.cadence === 'Daily'
    ? 'Trailing 7 days, sent daily'
    : `Covers the last ${WINDOW[r.cadence]} days`;
}

export function Reports() {
  const list = useReports();
  const active = useChannels();
  const [creating, setCreating] = useState(false);

  return (
    <>
      {/* ⚠️ No "Export now" here any more. The header already has Export, and
          this one ignored the date picker -- it always wrote 30 days of every
          channel, so two buttons named Export produced different files. */}
      <header className="gr-section-head">
        <span className="gr-spacer" />
        {!creating && (
          <Button variant="primary" onClick={() => setCreating(true)}>New report</Button>
        )}
      </header>

      {creating && <NewReport active={active} onDone={() => setCreating(false)} />}

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
            {list.map((r) => {
              const run = exportChannels(r, active);
              return (
                <tr key={r.id} className="gr-report-row">
                  <td>
                    <span className="gr-report-name">
                      <strong className="gr-type-body-medium">{r.name}</strong>
                      {/* Derived from the channels the export runs -- never typed
                          separately, so the label cannot describe a different file. */}
                      <span className="gr-type-caption">{scopeLabel(r)}</span>
                    </span>
                  </td>
                  <td>
                    <span className="gr-report-name">
                      <span className="gr-type-body gr-report-when">{r.when}</span>
                      <span className="gr-type-caption">{covers(r)}</span>
                    </span>
                  </td>
                  <td className="gr-type-body">
                    {Array.isArray(r.recipients) ? (
                      <span className="gr-report-people">
                        {r.recipients.map((id) => MEMBERS[id]).filter(Boolean).map((m) => (
                          <Avatar key={m.id} initials={m.initials} hue={m.hue} src={m.avatar}
                                  name={m.name} size={24} />
                        ))}
                      </span>
                    ) : r.recipients}
                  </td>
                  <td><StatusPill stage={r.stage} /></td>
                  <td>
                    {r.lastRun
                      ? <span className="gr-type-body">{r.lastRun}</span>
                      : <Badge label="Never run" tone="neutral" />}
                  </td>
                  <td className="gr-report-actions">
                    {run ? (
                      <Button variant="ghost"
                              onClick={() => downloadCsv(run, WINDOW[r.cadence], r.name)}>
                        Export
                      </Button>
                    ) : (
                      /* Said, not just disabled. A greyed button with no reason
                         reads as broken; this reads as a consequence of a
                         setting the reader can go and change. */
                      <span className="gr-type-caption gr-report-off">
                        {scopeLabel(r)} switched off
                      </span>
                    )}
                    {r.own && (
                      <Button variant="ghost" onClick={() => removeReport(r.id)}
                              aria-label={`Remove ${r.name}`}>
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
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
