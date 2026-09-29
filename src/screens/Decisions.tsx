import { useState } from 'react';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Badge } from '../components/Badge/Badge';
import { ChannelMark } from '../components/ChannelMark/ChannelMark';
import type { ChannelName } from '../styles/tokens';
import { decisions, targetOfDecision, TIER_LABEL, type Candidate, type Target, type Tier } from '../data/decisions';
import { addFlag, isFlagged, isOverdue, isOwnDecision, removeFlag, useFlags, type Flag } from '../data/attention';
import { TaskFields, formatDue } from '../components/TaskFields/TaskFields';
import { CHANNEL_DEPTH, groupNoun, leafNoun } from '../data/channelDepth';
import { dismiss, isDismissed, restore, useDismissals } from '../data/dismissedDecisions';
import { useChannels } from '../data/channels';
import { formatMetric, type Range } from '../data/metrics';

export interface DecisionsProps {
  range: Range;
  /** Opens the assistant on this finding, so the card can be argued with. */
  onDiscuss?: (question: string) => void;
  /**
   * Opens the item a decision is about. Every card has one -- a decision you
   * cannot get back to the subject of is an instruction with no address.
   */
  onOpen?: (target: Target) => void;
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
export function Decisions({ range, onDiscuss, onOpen }: DecisionsProps) {
  const channels = useChannels();
  /* Subscribed to both stores, so accepting or dismissing repaints immediately
     and a second tab stays in step. */
  const flags = useFlags();

  /* Read ONCE here, not per row. The first version called a hook inside the
     dismissed list's .map(), which is a hook in a loop -- the count changes with
     the data, React's hook order breaks, and it crashes the moment someone
     dismisses a second card. Hooks at the top; lookups in the list. */
  const dismissed = useDismissals();

  const [showDismissed, setShowDismissed] = useState(false);
  const all = decisions(range, channels);
  /* ⭐ Taken decisions LEAVE the proposal list.

     Accepting used to leave the card where it was with a small "on your queue"
     label, so after taking three there was nowhere that showed the three — they
     sat scattered among the things still being proposed, and the queue had no
     answer to "what did I commit to". Tommy read that as the decisions not
     carrying over at all, which is the right reading: a pile you cannot see is
     not a pile.

     A proposal and a commitment are different states, so they get different
     places rather than the same place with a badge. */
  /* ⭐ Ordered by WHEN YOU DECIDED, newest first — not by what the engine thinks.
   *
   * Taken cards were coming out in engine order (tier, then strength) while
   * written ones came out newest-first, so the thing you just added could land
   * anywhere in the list. A queue you are working is read top-down, and the item
   * you just put there is the one you are still thinking about.
   *
   * ⚠️ Built from the FLAG list rather than the candidate list, because only the
   * flag knows when the decision was made. Deriving order from the engine means
   * the queue is sorted by the engine's opinion of importance, which is exactly
   * what a queue of YOUR commitments should not be.
   */
  const byId = new Map(all.map((c) => [c.id, c]));
  const queue = [...flags]
    .filter((f) => f.kind === 'decision')
    .sort((a, b) => b.at - a.at)
    .map((f) => ({ flag: f, candidate: byId.get(f.refId) }))
    .filter((e) => e.candidate !== undefined || isOwnDecision(e.flag));

  const live = all.filter((c) => !isDismissed(c.id) && !isFlagged('decision', c.id));
  const hidden = all.filter((c) => isDismissed(c.id));

  const tiers: Tier[] = [1, 2, 3];

  return (
    <>
      {/* ONE line, not a second heading and a paragraph. The page title already
          says "Decisions"; an H2 of "What to do next" under it was the same
          heading twice, and three lines of prose before the first card is a
          wall to read past on every visit. */}
      <header className="gr-dec__head">
        <p className="gr-type-caption gr-dec__lede">
          Computed from the same numbers the charts use — no model wrote these. Grouped
          by <strong>how well the data supports them</strong>, not by dollar size.
        </p>
        {hidden.length > 0 && (
          <Button variant="ghost" onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? 'Hide' : `Dismissed (${hidden.length})`}
          </Button>
        )}
      </header>

      {/* ⚠️ FIRST, above everything the engine is still proposing. What you have
          decided outranks what you are being offered — burying it under three
          tiers of suggestions is the queue arguing that its own output matters
          more than the reader's. */}
      {queue.length > 0 && (
        <section className="gr-dec__tier is-queue">
          <header className="gr-dec__tier-head">
            {/* ⚠️ "Your queue" above "Do these" read as two instructions. Both
                sounded imperative, and neither said which was DECIDED and which
                was PROPOSED — the one distinction the whole screen is built on.
                The headings say it now, so the badges do not have to carry it
                alone. */}
            <h3 className="gr-type-card-heading">Decided</h3>
            <Badge label="You committed to these" tone="good" />
            <span className="gr-dec__count gr-type-caption-med">{queue.length}</span>
          </header>
          <p className="gr-type-caption gr-dec__tier-note">
            Newest first. Everything below this is still only proposed.
          </p>
          <div className="gr-dec__list">
            {queue.map(({ flag: f, candidate }) => (candidate ? (
              <DecisionCard key={f.id} candidate={candidate} flag={f}
                            onDiscuss={onDiscuss} onOpen={onOpen} />
            ) : (
              <article key={f.id} className={`gr-card gr-dec__card is-own ${isOverdue(f) ? 'is-overdue' : ''}`}>
                {/* ⭐ The SAME shape as an engine card: breadcrumb with the
                    channel mark, the action, then the figures.

                    "There is nothing to check it against" was true of the CLAIM
                    and false of the CONTEXT. A decision written in the panel was
                    written ABOUT something, and the numbers on screen at that
                    moment are as real as any the engine cites. Discarding them
                    is what made this card look unfinished beside its neighbour.

                    ⚠️ Rendered from what was CAPTURED, never re-derived. These
                    are the figures the reader was looking at when they decided;
                    looking them up now would quietly restate the decision
                    against numbers that have moved since. */}
                {f.scope && f.scope.length > 0 && (
                  <p className="gr-dec__scope gr-type-caption">
                    {f.channel && (
                      <ChannelMark channel={f.channel as ChannelName} size={14} />
                    )}
                    {f.scope.map((part, i) => (
                      <span key={`${part}-${i}`}>
                        {i > 0 && <span className="gr-dec__crumb" aria-hidden="true"> › </span>}
                        {part}
                      </span>
                    ))}
                    <span className="gr-dec__crumb" aria-hidden="true"> › </span>
                    decided {new Date(f.at).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric',
                    })}
                  </p>
                )}

                <header className="gr-dec__card-head">
                  <h4 className="gr-type-strip gr-dec__action">{f.label}</h4>
                  <span className="gr-type-caption gr-dec__stake">Your decision</span>
                </header>

                {f.evidence && f.evidence.length > 0 && (
                  <dl className="gr-dec__evidence">
                    {f.evidence.map((e) => (
                      <div key={e.label}>
                        <dt className="gr-type-overline">{e.label}</dt>
                        <dd className="gr-type-body-medium">{e.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                <TaskFields flag={f} />

                <footer className="gr-dec__actions">
                  <GoTo target={targetOfDecision(f, all)} channel={f.channel} onOpen={onOpen} />
                  <Button variant="ghost" onClick={() => removeFlag('decision', f.refId)}>
                    Remove
                  </Button>
                </footer>
              </article>
            )))}
          </div>
        </section>
      )}

      {live.length === 0 && queue.length === 0 && (
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
                {tier === 3 ? 'Worth investigating'
                  : tier === 2 ? 'Proposed — needs a judgement call'
                  : 'Proposed — ready to act'}
              </h3>
              <Badge
                label={TIER_LABEL[tier]}
                tone={tier === 3 ? 'warn' : tier === 2 ? 'accent' : 'good'}
              />
              <span className="gr-dec__count gr-type-caption-med">{mine.length}</span>
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
                <DecisionCard key={c.id} candidate={c} onDiscuss={onDiscuss} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}

      {showDismissed && hidden.length > 0 && (
        <section className="gr-dec__tier">
          <header className="gr-dec__tier-head">
            <h3 className="gr-type-card-heading">Dismissed</h3>
            <span className="gr-dec__count gr-type-caption-med">{hidden.length}</span>
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

/**
 * "Go to <the thing>". A BUTTON, not a linked breadcrumb -- Tommy asked for
 * buttons over link text on the Ask control, and the reason holds here: this is
 * the action, and it should look like one.
 */
function GoTo({ target, channel, onOpen }: {
  target?: Target; channel?: string; onOpen?: (t: Target) => void;
}) {
  if (!target || !onOpen) return null;
  /* The NOUN for anything below a channel, not its name. The breadcrumb above
     already names it, and an ad's full headline made "Go to Start free, no
     card →" -- a button wider than the card's other three put together. The
     platform's own word, so a podcast says "Go to spot". */
  const ch = channel && channel in CHANNEL_DEPTH ? (channel as ChannelName) : undefined;
  const label = target.kind === 'account' ? 'all channels'
    : target.kind === 'channel' ? target.label
    : target.kind === 'campaign' ? 'campaign'
    : target.kind === 'adSet' ? (ch ? groupNoun(ch).one.toLowerCase() : 'ad set')
    : (ch ? leafNoun(ch).one.toLowerCase() : 'ad');
  return (
    <Button variant="ghost" onClick={() => onOpen(target)}
            /* The visible words first, then WHICH one -- so a screen reader
               hears the name, and voice control ("click Go to ad") still
               matches what is on screen. */
            aria-label={target.kind === 'account' || target.kind === 'channel'
              ? undefined : `Go to ${label}: ${target.label}`}>
      Go to {label} →
    </Button>
  );
}

function DecisionCard({ candidate: c, flag, onDiscuss, onOpen }: {
  candidate: Candidate;
  /** Present on the Decided queue -- the record owner and due date live on. */
  flag?: Flag;
  onDiscuss?: (question: string) => void;
  onOpen?: (target: Target) => void;
}) {
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const accepted = isFlagged('decision', c.id);

  return (
    <article className={`gr-card gr-dec__card is-tier-${c.tier} ${flag && isOverdue(flag) ? 'is-overdue' : ''}`}>
      {/* ⭐ Where this decision lives, before what it says.

          A decision without its scope is an instruction with no address.
          "Review why 'Start free, no card' is paused" and "Review pacing" read
          as the same KIND of thing, and one touches a single creative inside one
          ad set of one campaign while the other is the whole account. The
          evidence rows carried it, but too quietly and below the action — by
          then the reader has already weighed one against the other. */}
      <p className="gr-dec__scope gr-type-caption">
        {c.channel && <ChannelMark channel={c.channel} size={14} />}
        {c.scope.map((part, i) => (
          <span key={part}>
            {i > 0 && <span className="gr-dec__crumb" aria-hidden="true"> › </span>}
            {part}
          </span>
        ))}
      </p>

      <header className="gr-dec__card-head">
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
            <span className="gr-type-overline">Check on</span> {formatDue(c.expectation.checkOn)}
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

      {/* Only once decided. A proposal has no owner -- nobody has agreed to it. */}
      {accepted && flag && <TaskFields flag={flag} />}

      <footer className="gr-dec__actions">
        {/* ⚠️ Tier 3 gets no Accept button. There is nothing to accept — it is a
            question, and offering to "accept" it would turn it back into the
            recommendation the tier exists to refuse. */}
        {c.tier !== 3 && (
          /* Once accepted there is no Accept, and no "✓ On your queue" label:
             the card is sitting under a heading that says Decided. Saying it
             again pushed the row onto two lines. */
          !accepted && (
            <Button variant="primary"
                    onClick={() => addFlag('decision', c.id, c.action, { target: c.target })}>
              Accept
            </Button>
          )
        )}

        <GoTo target={flag?.target ?? c.target} channel={c.channel} onOpen={onOpen} />

        {/* ⭐ The route from the queue into the conversation. A card states a
            finding; this is how you argue with it. Tier 3 gets it too -- in fact
            it needs it most, because "why won't you answer that?" is exactly the
            question a refusal provokes. */}
        {onDiscuss && (
          <Button variant="ghost" onClick={() => onDiscuss(`Why “${c.action}”?`)}>
            Talk about this
          </Button>
        )}

        {accepted ? (
          /* Undo takes Dismiss's place at the far edge. Dismissing something
             you already committed to is not a thing -- you take it back. */
          <Button variant="ghost" className="gr-dec__dismiss"
                  onClick={() => removeFlag('decision', c.id)}>
            Undo
          </Button>
        ) : dismissing ? (
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
          /* Pushed to the far edge, away from Accept. Four equal buttons in a
             row gave "throw this away" the same weight as "do it". */
          <Button variant="ghost" className="gr-dec__dismiss" onClick={() => setDismissing(true)}>
            Dismiss
          </Button>
        )}
      </footer>
    </article>
  );
}
