import { Fragment, useState } from 'react';
import './CampaignTable.css';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { StatusMenu } from '../StatusMenu/StatusMenu';
import { StatusPill, type Stage } from '../StatusPill/StatusPill';
import { Chip } from '../Chip/Chip';
import { CAMPAIGNS, type Campaign } from '../../data/campaigns';
import { CHANNEL_LABEL } from '../../data/metrics';
import type { ChannelName } from '../../styles/tokens';


const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const cacOf = (c: { spend: number; leads: number }) =>
  c.leads > 0 ? `$${(c.spend / c.leads).toFixed(2)}` : '—';

export interface CampaignTableProps {
  /** Optional channel filter, set when drilling in from Channels. */
  channel?: ChannelName | null;
  wideColumns?: boolean;
}

export function CampaignTable({ channel = null, wideColumns = true }: CampaignTableProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ChannelName | null>(channel);
  /* Stage overrides live here rather than mutating CAMPAIGNS, so the seed
     data stays the seed data and a reload is a clean slate. */
  const [stages, setStages] = useState<Record<string, Stage>>({});

  const rows = filter ? CAMPAIGNS.filter((c) => c.channel === filter) : CAMPAIGNS;

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="gr-card">
      <header className="gr-card__header">
        <h3 className="gr-card__title gr-type-card-heading">Campaigns</h3>
        <div className="gr-campaigns__filters">
          {filter && (
            <Chip label={CHANNEL_LABEL[filter]} removable onRemove={() => setFilter(null)} />
          )}
          <span className="gr-campaigns__count gr-type-caption">
            {rows.length} of {CAMPAIGNS.length}
          </span>
        </div>
      </header>

      <table className="gr-table gr-campaigns">
        <thead>
          <tr className="gr-type-overline">
            <th scope="col" className="gr-campaigns__expander" aria-label="Expand" />
            <th scope="col">Campaign</th>
            {wideColumns && <th scope="col">Objective</th>}
            <th scope="col">Status</th>
            <th scope="col">Spend</th>
            <th scope="col">Leads</th>
            {wideColumns && <th scope="col">CAC</th>}
            <th scope="col">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c: Campaign) => {
            const isOpen = open.has(c.id);
            return (
              <Fragment key={c.id}>
                <tr className="gr-table__row gr-campaigns__row">
                  <td className="gr-campaigns__expander">
                    <button
                      type="button"
                      className={`gr-campaigns__caret ${isOpen ? 'is-open' : ''}`}
                      onClick={() => toggle(c.id)}
                      aria-expanded={isOpen}
                      aria-controls={`adsets-${c.id}`}
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${c.name}`}
                    >
                      <svg width="8" height="5" viewBox="0 0 8 5" aria-hidden="true">
                        <path d="M1 1L4 4L7 1" fill="none" stroke="currentColor"
                              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </td>
                  <td>
                    <span className="gr-table__channel gr-type-body-medium">
                      <ChannelMark channel={c.channel} size={16} />
                      {c.name}
                    </span>
                    <span className="gr-campaigns__meta gr-type-caption">
                      {CHANNEL_LABEL[c.channel]} · {c.adSets.length} ad set{c.adSets.length === 1 ? '' : 's'}
                    </span>
                  </td>
                  {wideColumns && <td className="gr-type-body">{c.objective}</td>}
                  <td>
                    <StatusMenu
                      value={stages[c.id] ?? c.stage}
                      onChange={(next) => setStages((p) => ({ ...p, [c.id]: next }))}
                    />
                  </td>
                  <td className="gr-type-body">{money(c.spend)}</td>
                  <td className="gr-type-body">{c.leads.toLocaleString()}</td>
                  {wideColumns && <td className="gr-type-body">{cacOf(c)}</td>}
                  <td className="gr-type-body">{c.roas.toFixed(1)}x</td>
                </tr>

                {isOpen &&
                  c.adSets.map((a, i) => (
                    <tr key={a.id} id={i === 0 ? `adsets-${c.id}` : undefined} className="gr-campaigns__child">
                      <td />
                      <td className="gr-type-body">
                        <span className="gr-campaigns__rule" aria-hidden="true" />
                        {a.name}
                      </td>
                      {wideColumns && <td />}
                      <td><StatusPill stage={a.stage} /></td>
                      <td className="gr-type-body">{money(a.spend)}</td>
                      <td className="gr-type-body">{a.leads.toLocaleString()}</td>
                      {wideColumns && <td className="gr-type-body">{cacOf(a)}</td>}
                      <td />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
