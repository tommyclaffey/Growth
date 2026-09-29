import { useState } from 'react';
import './CompareCard.css';
import { CAMPAIGNS } from '../../data/campaigns';
import { compareCampaigns } from '../../data/compare';
import { CHANNEL_LABEL, CHANNEL_KEYS, type Range } from '../../data/metrics';
import { ChannelMark } from '../ChannelMark/ChannelMark';
import { Button } from '../Button/Button';

export interface CompareCardProps {
  campaignId: string;
  range: Range;
  /** Talk the difference through with the assistant. */
  onAsk?: (question: string) => void;
}

/** "Compare with…" on a campaign page -- this campaign against one you pick. */
export function CompareCard({ campaignId, range, onAsk }: CompareCardProps) {
  const [other, setOther] = useState('');
  const cmp = other ? compareCampaigns(campaignId, other, range) : undefined;

  return (
    <section className="gr-card gr-compare">
      <header className="gr-card__header">
        <h3 className="gr-card__title gr-type-card-heading">Compare</h3>
        <span className="gr-spacer" />
        <label className="gr-table__metric">
          <span className="gr-type-caption gr-table__metric-label">With</span>
          <select className="gr-table__select gr-type-label-button" value={other}
                  aria-label="Campaign to compare with"
                  onChange={(e) => setOther(e.target.value)}>
            <option value="">Choose a campaign…</option>
            {/* Same channel first -- the like-for-like comparison. */}
            {CHANNEL_KEYS.map((ch) => {
              const list = CAMPAIGNS.filter((c) => c.channel === ch && c.id !== campaignId);
              if (list.length === 0) return null;
              return (
                <optgroup key={ch} label={CHANNEL_LABEL[ch]}>
                  {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              );
            })}
          </select>
        </label>
      </header>

      {!cmp ? (
        <p className="gr-type-caption gr-compare__hint">
          Put another campaign beside this one — same range, metric by metric, with the better
          one marked on cost and efficiency.
        </p>
      ) : (
        <>
          <table className="gr-table gr-compare__table">
            <thead>
              <tr className="gr-type-overline">
                <th scope="col">Metric</th>
                <th scope="col">
                  <span className="gr-compare__who"><ChannelMark channel={cmp.a.channel} size={14} />{cmp.a.name}</span>
                </th>
                <th scope="col">
                  <span className="gr-compare__who"><ChannelMark channel={cmp.b.channel} size={14} />{cmp.b.name}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {/* A metric neither campaign reports is a row of two dashes --
                  nothing to compare, so no row. */}
              {cmp.rows.filter((r) => r.a !== undefined || r.b !== undefined).map((r) => (
                <tr key={r.metric}>
                  <th scope="row" className="gr-type-body">{r.metric}</th>
                  {(['a', 'b'] as const).map((side) => (
                    <td key={side} className={`gr-type-body-medium ${r.winner === side ? 'is-better' : ''}`}>
                      {r[side] ?? <span className="gr-table__na" title="This channel does not report it">—</span>}
                      {r.winner === side && <span className="gr-compare__mark" aria-label="better">✓</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {cmp.crossChannel && (
            <p className="gr-type-caption gr-compare__note">
              Different channels: cost comparisons across channels are last-touch, not like for like —
              a channel that starts journeys can look more expensive than it is.
            </p>
          )}
          {onAsk && (
            <div className="gr-compare__ask">
              <Button variant="ghost" onClick={() => onAsk(`Compare ${cmp.a.name} with ${cmp.b.name}`)}>
                Talk through the difference
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
