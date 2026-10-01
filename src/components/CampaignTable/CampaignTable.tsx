import { Fragment, useState } from 'react';
import './CampaignTable.css';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { StatusMenu } from '../StatusMenu/StatusMenu';
import { StatusPill } from '../StatusPill/StatusPill';
import { Chip } from '../Chip/Chip';
import { CAMPAIGNS, type Campaign } from '../../data/campaigns';
import { setStage, useCampaignStatus } from '../../data/campaignStatus';
import { CHANNEL_LABEL, formatMoney } from '../../data/metrics';
import { useChannels } from '../../data/channels';
import type { ChannelName } from '../../styles/tokens';
import type { Target } from '../../data/decisions';


/* The account's currency -- a EUR account was shown dollars. Leads rounded:
   Google's conversions are fractional and "123.457 leads" is not a count. */
const money = (n: number) => formatMoney(n, 0);
const cacOf = (c: { spend: number; leads: number }) =>
  c.leads > 0 ? formatMoney(c.spend / c.leads, 2) : '—';
const count = (n: number) => Math.round(n).toLocaleString();

export interface CampaignTableProps {
  /** Optional channel filter, set when drilling in from Channels. */
  channel?: ChannelName | null;
  wideColumns?: boolean;
  /** Opens the campaign's detail page. The caret still expands in place. */
  onOpenCampaign?: (id: string) => void;
  /** Raises this campaign with the decision agent. */
  onAskAbout?: (question: string, subject?: Target) => void;
}

export function CampaignTable({ channel = null, wideColumns = true, onOpenCampaign, onAskAbout }: CampaignTableProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const stageOf = useCampaignStatus();
  const [filter, setFilter] = useState<ChannelName | null>(channel);
  /* Stage overrides live here rather than mutating CAMPAIGNS, so the seed
     data stays the seed data and a reload is a clean slate. */

  /* Only channels this account runs -- a switched-off channel is gone
     everywhere else, and was still listed here ("9 of 9"). */
  /* Subscribed: an unsubscribed read only refreshed if the parent re-rendered. */
  const live = useChannels();
  const rows = CAMPAIGNS.filter((c) => live.includes(c.channel) && (!filter || c.channel === filter));

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
            {onAskAbout && <th scope="col" className="gr-table__ask"><span className="gr-sr-only">Discuss</span></th>}
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
                          <button type="button" className="gr-campaigns__open gr-unbutton"
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
                    {/* Same store as the campaign page. Held in component
                        state this reset on every navigation, and the two
                        screens would have disagreed. */}
                    <StatusMenu value={stageOf(c.id)} onChange={(next) => setStage(c.id, next)} />
                  </td>
                  <td className="gr-type-body">{money(c.spend)}</td>
                  <td className="gr-type-body">{count(c.leads)}</td>
                  {wideColumns && <td className="gr-type-body">{cacOf(c)}</td>}
                  <td className="gr-type-body">{c.roas.toFixed(1)}x</td>
                  {onAskAbout && (
                    <td className="gr-table__ask gr-type-caption-med">
                      <button type="button" className="gr-unbutton gr-ask"
                              aria-label={`Ask about ${c.name}`}
                              onClick={(e) => {
                                /* The row expands on click; this must not also
                                   toggle it open behind the panel. */
                                e.stopPropagation();
                                onAskAbout(`What’s going on with ${c.name}?`,
                                  { kind: 'campaign', id: c.id, label: c.name });
                              }}>
                        Ask
                      </button>
                    </td>
                  )}
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
                      <td className="gr-type-body">{count(a.leads)}</td>
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
