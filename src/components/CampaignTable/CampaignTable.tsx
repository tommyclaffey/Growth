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
  /** Opens the campaign's detail page. The caret still expands in place. */
  onOpenCampaign?: (id: string) => void;
}

export function CampaignTable({ channel = null, wideColumns = true, onOpenCampaign }: CampaignTableProps) {
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
                    {/* The NAME opens the page; the caret expands in place.
                        Two different questions -- "show me more here" and "take
                        me to this" -- so they get two different controls rather
                        than one that has to guess. A button, not a row click,
                        because the row also contains a status menu and a caret,
                        and a click target that swallows its own children is how
                        you end up navigating when someone meant to pause. */}
                    <span className="gr-table__channel gr-type-body-medium">
                      <ChannelMark channel={c.channel} size={16} />
                      {onOpenCampaign
                        ? (
                          <button type="button" className="gr-campaigns__open"
                                  onClick={() => onOpenCampaign(c.id)}>
                            {c.name}
                          </button>
                        )
                        : c.name}
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
                        {/* The flex lives on this span, NOT on the <td>.
                            `display: flex` on a table cell takes it out of the
                            table layout algorithm -- the browser stops treating
                            it as a cell, wraps it in an anonymous one, and the
                            column alignment breaks. That was rendering as a
                            stray pale bar under the ad-set name. */}
                        <span className="gr-campaigns__adset">
                          <span className="gr-campaigns__rule" aria-hidden="true" />
                          {a.name}
                        </span>
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
