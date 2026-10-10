import { useState } from 'react';
import './screens.css';
import { Button } from '../components/Button/Button';
import { Badge } from '../components/Badge/Badge';
import { ChannelMark } from '../components/ChannelMark/ChannelMark';
import type { ChannelName } from '../styles/tokens';
import { decisions, heldBack, targetOfDecision, TIER_LABEL, type Candidate, type Target, type Tier } from '../data/decisions';
import { planFrom, type Plan } from '../data/plan';
import { addFlag, isFlagged, isOverdue, isOwnDecision, removeFlag, useFlags, type Flag } from '../data/attention';
import { TaskFields } from '../components/TaskFields/TaskFields';
import { formatDue } from '../data/dates';
import type { DecisionRef } from '../data/chat';
import { Scorecard } from '../components/Scorecard/Scorecard';
import { baselineFor, grade, tally } from '../data/grading';
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
  /** Stages this decision in team chat -- pick a conversation, then Send. */
  onShare?: (d: DecisionRef) => void;
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
/**
 * ⭐ Cards shown per tier before "Show N more".
 *
 * A large account (60 campaigns, 1,200 ads) produces 150-340 proposals. All of
 * them on one page is not a queue, it is a report nobody finishes. The engine
 * already sorts each tier best-supported first, so the top six ARE the agenda;
 * the rest stay one click away and the tier's count still says the full number.
 * Six = three rows of the two-column grid, and the demo account's largest tier,
 * so the demo renders exactly as before.
 */
export const PER_TIER = 6;

export function Decisions({ range, onDiscuss, onOpen, onShare }: DecisionsProps) {
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
  const [showHeld, setShowHeld] = useState(false);
  /* Tiers the reader opened past the first PER_TIER. */
  const [expanded, setExpanded] = useState<Set<Tier>>(() => new Set());
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
    .map((f) => ({ flag: f, candidate: byId.get(f.refId) }));
    /* 🐛 Every decision stays, even once the engine stops proposing it. The
       filter here dropped a decided card whose finding had gone -- so deciding
       on a campaign in Review, then approving it, made the decision VANISH at
       the moment it should have said "done". A commitment outlives the
       suggestion that prompted it; it renders from what the flag captured. */

  const live = all.filter((c) => !isDismissed(c.id) && !isFlagged('decision', c.id));
  const hidden = all.filter((c) => isDismissed(c.id));
  /* Found and not shown -- could be chance, or not worth the marginal price. */
  const held = heldBack(range, channels);
  /* ⭐ The proposals still waiting, added up. Accepting moves cards out of
     `live`, so the plan shrinks to what is left. */
  const plan = planFrom(live, range, channels);

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
        {held.length > 0 && (
          <Button variant="ghost" aria-expanded={showHeld} onClick={() => setShowHeld(!showHeld)}>
            {showHeld ? 'Hide held back' : `Held back (${held.length})`}
          </Button>
        )}
        {hidden.length > 0 && (
          <Button variant="ghost" aria-expanded={showDismissed} onClick={() => setShowDismissed(!showDismissed)}>
            {showDismissed ? 'Hide dismissed' : `Dismissed (${hidden.length})`}
          </Button>
        )}
      </header>

      {showHeld && held.length > 0 && (
        <section className="gr-dec__tier" aria-label="Held back">
          <header className="gr-dec__tier-head">
            <h3 className="gr-type-card-heading">Held back</h3>
            <span className="gr-dec__count gr-type-caption-med">{held.length}</span>
          </header>
          <p className="gr-type-caption gr-dec__tier-note">
            The engine found these and chose <strong>not</strong> to recommend them. Each says why.
            They come back on their own when the numbers can carry them.
          </p>
          <div className="gr-dec__list">
            {held.map((c) => (
              <div key={c.id} className="gr-card gr-dec__card is-held">
                <p className="gr-type-body-medium">{c.action}</p>
                <p className="gr-type-caption gr-dec__why">{c.held!.sentence}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Held back and Dismissed open right under the buttons that reveal them --
          asked-for, not proposed. Dismissed used to open at the very bottom,
          a screen away from its own toggle. */}
      {showDismissed && hidden.length > 0 && (
        <section className="gr-dec__tier" aria-label="Dismissed">
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
            <h3 className="gr-type-card-heading" id="gr-dec-decided" tabIndex={-1}>Decided</h3>
            <Badge label="You committed to these" tone="good" />
            <span className="gr-dec__count gr-type-caption-med">{queue.length}</span>
            {/* ⭐ The track record. A decision maker that never checks whether
                its calls worked is a suggestion box. */}
            {(() => {
              const t = tally(queue.map(({ flag }) => grade(flag)));
              return (
                <span className="gr-type-caption gr-dec__record">
                  Track record: <strong>{t.good} worked</strong> · {t.bad} didn&rsquo;t · {t.open} still open
                </span>
              );
            })()}
          </header>
          <p className="gr-type-caption gr-dec__tier-note">
            Newest first. Each one is graded against the number it was meant to move.
            Everything below this is still only proposed.
          </p>
          <div className="gr-dec__list">
            {queue.map(({ flag: f, candidate }) => (candidate ? (
              <DecisionCard key={f.id} candidate={candidate} flag={f} range={range}
                            onDiscuss={onDiscuss} onOpen={onOpen} onShare={onShare} />
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
                {(f.scope?.length || f.target) && (
                  <p className="gr-dec__scope gr-type-caption">
                    {f.channel && (
                      <ChannelMark channel={f.channel as ChannelName} size={14} />
                    )}
                    {(f.scope?.length ? f.scope : [f.target!.label]).map((part, i) => (
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
                  <h4 className="gr-type-section gr-dec__action">{f.label}</h4>
                  <span className="gr-type-caption gr-dec__stake">
                    {isOwnDecision(f) ? 'Your decision' : 'Accepted'}
                  </span>
                </header>

                {f.evidence && f.evidence.length > 0 && (
                  <dl className="gr-dec__evidence">
                    {f.evidence.map((e) => (
                      <div key={e.label}>
                        <dt className="gr-type-caption">{e.label}</dt>
                        <dd className="gr-type-body-medium">{e.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                <Scorecard flag={f} />
                <TaskFields flag={f} />

                <footer className="gr-dec__actions">
                  <GoTo target={targetOfDecision(f, all)} channel={f.channel} onOpen={onOpen} />
                  {onShare && (
                    <button type="button" className="gr-dec__minor gr-dec__minor--first gr-type-caption-med"
                            onClick={() => onShare({
                              refId: f.refId, label: f.label, scope: f.scope?.join(' › '), owner: f.owner, due: f.due,
                            })}>Share</button>
                  )}
                  <button type="button" className={`gr-dec__minor gr-type-caption-med ${onShare ? '' : 'gr-dec__minor--first'}`}
                          onClick={() => removeFlag('decision', f.refId)}>
                    Remove
                  </button>
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

      {plan.moves.length > 1 && (
        <PlanCard plan={plan} range={range}
                  /* The card unmounts on accept; focus follows the moves to where they went. */
                  onAccepted={() => requestAnimationFrame(() => document.getElementById('gr-dec-decided')?.focus())} />
      )}

      {tiers.map((tier) => {
        const mine = live.filter((c) => c.tier === tier);
        if (mine.length === 0) return null;
        const open = expanded.has(tier);
        const shown = open ? mine : mine.slice(0, PER_TIER);
        const rest = mine.length - PER_TIER;
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
              {shown.map((c) => (
                <DecisionCard key={c.id} candidate={c} onDiscuss={onDiscuss} onOpen={onOpen} range={range} onShare={onShare} />
              ))}
            </div>
            {rest > 0 && (
              <div className="gr-dec__more">
                <Button
                  variant="ghost"
                  aria-expanded={open}
                  onClick={() => setExpanded((prev) => {
                    const next = new Set(prev);
                    if (open) next.delete(tier); else next.add(tier);
                    return next;
                  })}
                >
                  {open ? 'Show fewer' : `Show ${rest} more`}
                </Button>
              </div>
            )}
          </section>
        );
      })}

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

/* ⚠️ Rounded FIRST, then signed, coloured and pluralised from what is SHOWN --
   "+0 leads", "−$0" and "+1 leads" were all possible, and DeltaBadge's own
   rule is "toned on what is shown". */
const wholeMoney = (n: number) => Math.round(n);
const wholeCount = (n: number) => Math.round(n);
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
const signedMoney = (n: number) => `${sign(wholeMoney(n))}${formatMetric('Spend', Math.abs(wholeMoney(n)))}`;
const signedCount = (n: number) => `${sign(wholeCount(n))}${Math.abs(wholeCount(n)).toLocaleString()}`;
/** A cost per lead with no leads under it is a dash, never "$∞". */
const cacOrDash = (n: number) => (Number.isFinite(n) ? formatMetric('CAC', n) : '—');
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * ⭐ "If I take all of it, where does my week land?"
 *
 * The cards one at a time are a pile; this is the sum. Three figures -- spend,
 * leads, cost per lead, each before → after -- then the one button that takes
 * every move with money in it. Questions, held-back findings and moves with no
 * money in them are named as left out, never silently dropped.
 */
function PlanCard({ plan, range, onAccepted }: { plan: Plan; range: Range; onAccepted?: () => void }) {
  const net = wholeMoney(plan.after.spend - plan.before.spend);
  const leads = wholeCount(plan.after.leads - plan.before.leads);
  const cacChange = Number.isFinite(plan.before.cac) && Number.isFinite(plan.after.cac)
    ? Math.round((plan.after.cac / plan.before.cac - 1) * 100) : null;
  const cutters = plan.moves.filter((c) => c.effect!.spend < 0).length;
  const adders = plan.moves.filter((c) => c.effect!.spend > 0).length;
  /* Shifts move money between two campaigns: no net spend, so neither of the above. */
  const shifters = plan.moves.length - cutters - adders;
  /* 🐛 It said "ready moves" while counting projections the screen files under
     "needs a judgement call". Accept all takes them too, so the card says so. */
  const judgement = plan.moves.filter((c) => c.tier === 2).length;
  const money = [
    cutters > 0 ? `frees ${formatMetric('Spend', plan.freed)} a week from ${plural(cutters, 'move')}` : '',
    adders > 0 ? `puts ${formatMetric('Spend', plan.added)} into ${plural(adders, 'move')}` : '',
    shifters > 0 ? `shifts money within ${plural(shifters, 'channel')}` : '',
  ].filter(Boolean);
  const moneyLine = money.length
    ? `${money.join(money.length > 2 ? ', ' : ' and ').replace(/^./, (x) => x.toUpperCase())}. ` : '';
  return (
    <section className="gr-card gr-dec__plan" aria-labelledby="gr-dec-plan-kicker" data-tour="plan">
      <header className="gr-dec__plan-head">
        <p className="gr-type-overline gr-dec__plan-kicker" id="gr-dec-plan-kicker">This week’s plan</p>
        <h3 className="gr-type-section gr-dec__action">
          Take these {plural(plan.moves.length, 'move')}
          {leads !== 0 ? `: ${signedCount(leads)} ${Math.abs(leads) === 1 ? 'lead' : 'leads'} a week` : ''}
          {net < 0 ? ` on ${formatMetric('Spend', -net)} less` : net > 0 ? ` for ${formatMetric('Spend', net)} more` : ''}
        </h3>
      </header>

      <dl className="gr-dec__evidence gr-dec__plan-figures">
        <div>
          <dt className="gr-type-caption">Spend a week</dt>
          <dd className="gr-type-body-medium">
            {formatMetric('Spend', plan.before.spend)} → {formatMetric('Spend', plan.after.spend)}
            {net !== 0 && <>{' '}<span className="gr-dec__plan-delta">{signedMoney(net)}</span></>}
          </dd>
        </div>
        <div>
          <dt className="gr-type-caption">Leads a week</dt>
          <dd className="gr-type-body-medium">
            {Math.round(plan.before.leads).toLocaleString()} → {Math.round(plan.after.leads).toLocaleString()}
            {leads !== 0 && <>{' '}<span className={`gr-dec__plan-delta ${leads > 0 ? 'is-good' : 'is-bad'}`}>{signedCount(leads)}</span></>}
          </dd>
        </div>
        <div>
          <dt className="gr-type-caption">Cost per lead</dt>
          <dd className="gr-type-body-medium">
            {cacOrDash(plan.before.cac)} → {cacOrDash(plan.after.cac)}
            {cacChange !== null && cacChange !== 0 && (
              <>{' '}<span className={`gr-dec__plan-delta ${cacChange < 0 ? 'is-good' : 'is-bad'}`}>
                {cacChange > 0 ? '+' : '−'}{Math.abs(cacChange)}%
              </span></>
            )}
          </dd>
        </div>
      </dl>

      <p className="gr-type-caption gr-dec__plan-note">
        {moneyLine}
        {judgement > 0 && (judgement === 1
          ? `${plan.moves.length === 1 ? 'It rests' : '1 of them rests'} on an assumption stated on its card. `
          : `${judgement === plan.moves.length ? 'Each rests' : `${judgement} of them rest`} on assumptions stated on their cards. `)}
        The extra leads come off each campaign’s curve
        {plan.assumed ? ', assumed where its spend has not moved enough to measure' : ''}. Figures
        are a week at the selected dates’ pace.
      </p>

      <footer className="gr-dec__actions">
        <Button variant="primary"
                onClick={() => {
                  for (const c of plan.moves) {
                    addFlag('decision', c.id, c.action, { target: c.target, baseline: baselineFor(c, range) });
                  }
                  onAccepted?.();
                }}>
          Accept all {plan.moves.length}
        </Button>
        {plan.also.length > 0 && (
          <span className="gr-type-caption gr-dec__plan-left">
            Not in the sum: {plural(plan.also.length, 'move')} with no money in
            {plan.also.length === 1 ? ' it' : ' them'}, below. Questions are never in it.
          </span>
        )}
      </footer>
    </section>
  );
}

function DecisionCard({ candidate: c, flag, onDiscuss, onOpen, range, onShare }: {
  range: Range;
  onShare?: (d: DecisionRef) => void;
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
    <article className={`gr-card gr-dec__card is-tier-${c.tier} ${flag && isOverdue(flag) ? 'is-overdue' : ''}`} data-tour="decision">
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
          <span key={`${part}-${i}`}>
            {i > 0 && <span className="gr-dec__crumb" aria-hidden="true"> › </span>}
            {part}
          </span>
        ))}
      </p>

      <header className="gr-dec__card-head">
        {/* ⭐ THE RECOMMENDATION LEADS (Tommy, Sept 30: "it's not very clear
            what the decision is ... that should be very predominant; everything
            else secondary"). The largest type on the card; the figures below
            dropped to body size so they support it instead of competing. */}
        <h4 className="gr-type-section gr-dec__action">{c.action}</h4>
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
            <dt className="gr-type-caption">{e.label}</dt>
            <dd className="gr-type-body-medium">{e.value}</dd>
          </div>
        ))}
      </dl>

      {/* ⭐ "Is that real?" -- answered on the card, in one line, for every
          claim that compares two things. Structural findings have no line:
          a count of ad groups has no chance in it. */}
      {c.confidence && (
        <p className={`gr-type-caption gr-dec__confidence is-${c.confidence.level}`} data-tour="confidence">
          <span className="gr-type-overline">
            {c.confidence.level === 'high' ? 'High confidence' : c.confidence.level === 'medium' ? 'Medium confidence' : 'Low confidence'}
          </span>{' '}
          {c.confidence.sentence}
        </p>
      )}

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
      {accepted && flag && <Scorecard flag={flag} />}
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
                    onClick={() => addFlag('decision', c.id, c.action, {
                      target: c.target, baseline: baselineFor(c, range),
                    })}>
              Accept
            </Button>
          )
        )}

        <GoTo target={flag?.target ?? c.target} channel={c.channel} onOpen={onOpen} />

        {/* ⭐ Into the conversation the team is having -- the decision staged in
            chat, like "Discuss" stages a chart. A decision that stays on one
            person's screen does not reach the people who act on it. */}
        {/* Secondary actions: text, not buttons, pushed right -- two strong
            controls (do it / go look) and the rest out of the way. */}
        {onDiscuss && (
          <button type="button" className="gr-dec__minor gr-dec__minor--first gr-type-caption-med"
                  onClick={() => onDiscuss(`Why “${c.action}”?`)}>
            Talk about this
          </button>
        )}
        {onShare && (
          <button type="button" className={`gr-dec__minor gr-type-caption-med ${onDiscuss ? '' : 'gr-dec__minor--first'}`}
                  onClick={() => onShare({
                    refId: c.id, label: c.action, scope: c.scope.join(' › '), owner: flag?.owner, due: flag?.due,
                  })}>Share</button>
        )}


        {accepted ? (
          /* Undo takes Dismiss's place at the far edge. Dismissing something
             you already committed to is not a thing -- you take it back. */
          <button type="button" className={`gr-dec__minor gr-type-caption-med ${onDiscuss || onShare ? '' : 'gr-dec__minor--first'}`}
                  onClick={() => removeFlag('decision', c.id)}>
            Undo
          </button>
        ) : dismissing ? (
          <form
            className="gr-dec__dismiss-form"
            onSubmit={(e) => { e.preventDefault(); dismiss(c.id, reason.trim() || 'No reason given'); }}
          >
            <input
              className="gr-dec__reason gr-type-body"
              aria-label="Why not?"
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
          <button type="button" className={`gr-dec__minor gr-type-caption-med ${onDiscuss || onShare ? '' : 'gr-dec__minor--first'}`}
                  onClick={() => setDismissing(true)}>
            Dismiss
          </button>
        )}
      </footer>
    </article>
  );
}
