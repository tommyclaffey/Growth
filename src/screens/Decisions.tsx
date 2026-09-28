import { useState } from 'react';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Badge } from '../components/Badge/Badge';
import { ChannelMark } from '../components/ChannelMark/ChannelMark';
import { decisions, TIER_LABEL, type Candidate, type Tier } from '../data/decisions';
import { addFlag, isFlagged, removeFlag, useFlags } from '../data/attention';
import { dismiss, isDismissed, restore, useDismissals } from '../data/dismissedDecisions';
import { useChannels } from '../data/channels';
import { formatMetric, type Range } from '../data/metrics';

export interface DecisionsProps {
  range: Range;
  /** Opens the assistant on this finding, so the card can be argued with. */
  onDiscuss?: (question: string) => void;
}

/**
 * The decision maker's surface.
 *
 * ⭐ Its own screen rather than a widget on Overview, and the reason is the claim
 * the feature makes: this is a thought partner, not a readout. A panel would have
 * framed it as another chart annotation.
 *
 * ⚠️ SECTIONED BY CONFIDENCE TIER, not sorted by impact — and that is the entire
 * design. The most eye-catching finding available here is *"podcasts cost $129 a
 * lead against TikTok's $33"*, carrying a whole channel's budget. It is also the
 * one this dashboard cannot support, because last-touch attribution always
 * flatters whichever channel sits nearest the conversion. An impact-ranked list
 * would put it first. This one puts it last, in a section that says out loud that
 * the data cannot answer it.
 *
 * So the sections are argued for on screen, not just implemented. A reader who
 * does not understand why a cheap-looking recommendation is filed under "cannot
 * answer" will override it, and the refusal will have cost nothing.
 */
export function Decisions({ range, onDiscuss }: DecisionsProps) {
  const channels = useChannels();
  /* Subscribed to both stores, so accepting or dismissing repaints immediately
     and a second tab stays in step. */
  useFlags();
  /* Read ONCE here, not per row. The first version called a hook inside the
     dismissed list's .map(), which is a hook in a loop -- the count changes with
     the data, React's hook order breaks, and it crashes the moment someone
     dismisses a second card. Hooks at the top; lookups in the list. */
  const dismissed = useDismissals();

  const [showDismissed, setShowDismissed] = useState(false);
  const all = decisions(range, channels);
  const live = all.filter((c) => !isDismissed(c.id));
  const hidden = all.filter((c) => isDismissed(c.id));

  const tiers: Tier[] = [1, 2, 3];

  return (
    <>
      <header className="gr-dec__head">
        <div>
          <h2 className="gr-type-section">What to do next</h2>
          <p className="gr-type-body gr-dec__lede">
            Every finding below is computed from the same numbers the charts render — no
            model wrote them. They are grouped by <strong>how well this data supports
            them</strong>, not by how large the figure is.
          </p>
        </div>
        {hidden.length > 0 && (
          <Button variant="ghost" onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? 'Hide' : `Dismissed (${hidden.length})`}
          </Button>
        )}
      </header>

      {live.length === 0 && (
        <div className="gr-card gr-dec__empty">
          <p className="gr-type-body">
            Nothing to decide on right now. That is a real answer, not an empty state —
            the engine found no finding this data can support.
          </p>
        </div>
      )}

      {tiers.map((tier) => {
        const mine = live.filter((c) => c.tier === tier);
        if (mine.length === 0) return null;
        return (
          <section key={tier} className={`gr-dec__tier is-tier-${tier}`}>
            <header className="gr-dec__tier-head">
              <h3 className="gr-type-card-heading">
                {tier === 3 ? 'Worth investigating' : tier === 2 ? 'Projections' : 'Do these'}
              </h3>
              <Badge
                label={TIER_LABEL[tier]}
                tone={tier === 3 ? 'warn' : tier === 2 ? 'accent' : 'good'}
              />
              <span className="gr-type-caption">{mine.length}</span>
            </header>

            {/* The argument for the section, stated where the reader is. A tier-3
                card with no explanation of why it is filed there reads as the
                product being evasive. */}
            {tier === 3 && (
              <p className="gr-type-caption gr-dec__tier-note">
                These are <strong>not recommendations.</strong> The arithmetic is real, but the
                cause is not in this data — Growth measures last touch and has no attribution
                model. Each one names what would actually answer it.
              </p>
            )}
            {tier === 2 && (
              <p className="gr-type-caption gr-dec__tier-note">
                Each of these rests on an assumption, stated on the card. The arithmetic holds;
                whether the assumption does is a judgement only you can make.
              </p>
            )}

            <div className="gr-dec__list">
              {mine.map((c) => (
                <DecisionCard key={c.id} candidate={c} onDiscuss={onDiscuss} />
              ))}
            </div>
          </section>
        );
      })}

      {showDismissed && hidden.length > 0 && (
        <section className="gr-dec__tier">
          <header className="gr-dec__tier-head">
            <h3 className="gr-type-card-heading">Dismissed</h3>
            <span className="gr-type-caption">{hidden.length}</span>
          </header>
          <div className="gr-dec__list">
            {hidden.map((c) => {
              const why = dismissed.find((d) => d.id === c.id)?.reason;
              return (
                <div key={c.id} className="gr-card gr-dec__card is-dismissed">
                  <p className="gr-type-body-medium">{c.action}</p>
                  {why && <p className="gr-type-caption gr-dec__why">Dismissed: “{why}”</p>}
                  <Button variant="ghost" onClick={() => restore(c.id)}>Restore</Button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function DecisionCard({ candidate: c, onDiscuss }: {
  candidate: Candidate;
  onDiscuss?: (question: string) => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const accepted = isFlagged('decision', c.id);

  return (
    <article className={`gr-card gr-dec__card is-tier-${c.tier}`}>
      <header className="gr-dec__card-head">
        {c.channel && <ChannelMark channel={c.channel} size={18} />}
        <h4 className="gr-type-strip gr-dec__action">{c.action}</h4>
        {c.atStake !== undefined && (
          <span className="gr-type-caption gr-dec__stake">
            {formatMetric('Spend', c.atStake)} in play
          </span>
        )}
      </header>

      <p className="gr-type-body gr-dec__because">{c.because}</p>

      <dl className="gr-dec__evidence">
        {c.evidence.map((e) => (
          <div key={e.label}>
            <dt className="gr-type-overline">{e.label}</dt>
            <dd className="gr-type-body-medium">{e.value}</dd>
          </div>
        ))}
      </dl>

      {c.expectation && (
        <div className="gr-dec__expect">
          <p className="gr-type-caption">
            <span className="gr-type-overline">Expect</span> {c.expectation.outcome}
          </p>
          {/* The assumption gets its own visually distinct line. Folding it into
              the expectation is how a projection starts reading as a promise. */}
          {c.expectation.assuming && (
            <p className="gr-type-caption gr-dec__assuming">
              <span className="gr-type-overline">Assuming</span> {c.expectation.assuming}
            </p>
          )}
          <p className="gr-type-caption gr-dec__check">
            <span className="gr-type-overline">Check on</span> {c.expectation.checkOn}
          </p>
        </div>
      )}

      {c.needs && (
        <div className="gr-dec__needs">
          <p className="gr-type-caption">
            <span className="gr-type-overline">To answer this you need</span> {c.needs}
          </p>
        </div>
      )}

      <footer className="gr-dec__actions">
        {/* ⚠️ Tier 3 gets no Accept button. There is nothing to accept — it is a
            question, and offering to "accept" it would turn it back into the
            recommendation the tier exists to refuse. */}
        {c.tier !== 3 && (
          accepted ? (
            <>
              <span className="gr-type-caption gr-dec__accepted">
                ✓ On your attention queue
              </span>
              <Button variant="ghost" onClick={() => removeFlag('decision', c.id)}>
                Undo
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => addFlag('decision', c.id, c.action)}>
              Accept
            </Button>
          )
        )}

        {/* ⭐ The route from the queue into the conversation. A card states a
            finding; this is how you argue with it. Tier 3 gets it too -- in fact
            it needs it most, because "why won't you answer that?" is exactly the
            question a refusal provokes. */}
        {onDiscuss && (
          <Button variant="ghost" onClick={() => onDiscuss(`Why “${c.action}”?`)}>
            Talk about this
          </Button>
        )}

        {dismissing ? (
          <form
            className="gr-dec__dismiss-form"
            onSubmit={(e) => { e.preventDefault(); dismiss(c.id, reason.trim() || 'No reason given'); }}
          >
            <input
              className="gr-dec__reason gr-type-body"
              placeholder="Why not? (this is the only feedback the engine gets)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
            <Button variant="ghost" type="submit">Save</Button>
          </form>
        ) : (
          <Button variant="ghost" onClick={() => setDismissing(true)}>Dismiss</Button>
        )}
      </footer>
    </article>
  );
}
