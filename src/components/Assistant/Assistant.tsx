import { useEffect, useRef, useState } from 'react';
import { useOverlay } from '../../data/useOverlay';
import './Assistant.css';
import { SUGGESTIONS, resolveSubject, type Answer } from '../../data/assistant';
import { decisions, figuresFor, type Target } from '../../data/decisions';
import { baselineFor } from '../../data/grading';
import { addFlag, isFlagged, ownDecisionId, removeFlag, useFlags } from '../../data/attention';
import { askAssistant, probeModel, type AnswerSource } from '../../data/assistantClient';
import { RANGE_LABEL, type Range } from '../../data/metrics';
import { ChannelMark } from '../ChannelMark/ChannelMark';


interface Turn {
  id: number;
  question: string;
  answer: Answer;
  source: AnswerSource;
  /* What the answer was ABOUT, kept so a decision written from it inherits the
     same context an engine finding would carry. */
  subject?: Target;
}

export interface AssistantProps {
  open: boolean;
  onClose: () => void;
  range: Range;
  /**
   * A question to ask on open, handed in from another surface.
   *
   * ⚠️ Consumed after asking rather than held. A seed is an instruction that
   * arrived once; treating it as state would re-ask it every time the panel is
   * reopened, which is the same defect the chat deep-link avoided by never
   * persisting its conversation parameter.
   */
  seed?: string | null;
  /** What the seeding control pointed at, so the agent need not re-derive it. */
  seedSubject?: Target | null;
  onSeedConsumed?: () => void;
}

/**
 * Assistant overlay — a prototype, deliberately.
 *
 * Built to test the input and the shape of a response before any of it is
 * designed properly. Everything it says is computed from the dashboard's own
 * data functions, and every answer shows the figures it used, so the panel
 * can never state a number the product cannot show.
 */
export function Assistant({ open, onClose, range, seed, seedSubject, onSeedConsumed }: AssistantProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  /* Whether a model is reachable. Probed, not inferred from the last answer —
     the footer makes a claim to the user, so it has to be checked. `null` is
     "not yet known", and the footer stays silent about the engine until it is. */
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  /* Subscribed, so taking a decision repaints the button here and the Decisions
     screen at the same time -- one store, two surfaces. */
  useFlags();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* A question handed in from elsewhere -- "talk about this" on a decision card.
     Asked once and then CONSUMED, so reopening the panel later does not re-ask
     it: a seed is an instruction that arrived, not a property of being open. The
     same reasoning the deep-link `t` parameter already uses. */
  useEffect(() => {
    if (!open || !seed) return;
    void submit(seed, seedSubject ?? undefined);
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seed]);

  useEffect(() => {
    if (open && hasModel === null) void probeModel().then(setHasModel);
  }, [open, hasModel]);

  /* Escape, focus trap and focus restore -- previously only Escape.
     aria-modal was declared on the dialog while Tab walked out into the
     dashboard behind it, which is a containment claim the DOM did not honour;
     and closing dropped focus to <body> rather than back to the Ask button. */
  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlay(open, dialogRef, onClose);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending]);

  if (!open) return null;

  async function submit(text: string, subject?: Target) {
    const q = text.trim();
    if (!q || pending) return;
    setDraft('');
    setPending(q);
    /* `finally`, because the guard above is `if (!q || pending) return` -- so if
       setPending(null) is ever skipped, the panel does not just lose one
       answer, it refuses every question for the rest of the session. A stuck
       spinner is indistinguishable from a hung app.

       askSafely() removes the known throw; this makes the state machine
       recover from ones nobody has thought of yet. */
    try {
      const { answer, source: src } = await askAssistant(q, range, subject);
      /* The probe can be optimistic — a key can be present but the call can still
         fail and fall back. Let what actually happened correct the claim. */
      if (src === 'local' && hasModel) setHasModel(false);
      setTurns((prev) => [...prev, {
        id: prev.length, question: q, answer, source: src,
        /* Resolved the same way the request was scoped, so the turn remembers
           what it was about. */
        subject: subject ?? resolveSubject(q),
      }]);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="gr-assist__scrim" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="gr-assist"
        role="dialog"
        aria-modal="true"
        aria-label="Assistant"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="gr-assist__head">
          <span className="gr-assist__mark" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M7 1.5v11M1.5 7h11M3.2 3.2l7.6 7.6M10.8 3.2l-7.6 7.6" />
            </svg>
          </span>
          <div>
            <h2 className="gr-type-section">Assistant</h2>
            <p className="gr-type-caption">Answers from this dashboard · {RANGE_LABEL[range]}</p>
          </div>
          <button type="button" className="gr-assist__close" onClick={onClose} aria-label="Close assistant">✕</button>
        </header>

        <div className="gr-assist__body">
          {turns.length === 0 && (
            <div className="gr-assist__empty">
              <p className="gr-type-body">
                Ask me what to do. I read the same numbers the charts do, and I will tell
                you which findings this data can support and which it cannot — with the
                figures I used, every time.
              </p>
              <div className="gr-assist__suggestions">
                {SUGGESTIONS.map((sugg) => (
                  <button key={sugg} type="button"
                          className="gr-assist__suggestion gr-type-body"
                          onClick={() => submit(sugg)}>
                    {sugg}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t) => (
            <div key={t.id} className="gr-assist__turn">
              <p className="gr-assist__q gr-type-body-medium">{t.question}</p>
              <div className={`gr-assist__a ${t.answer.answered ? '' : 'is-refusal'}`}>
                {/* Split on blank lines. A decision answer carries several
                    findings and each one's assumption on its own line; rendered
                    as a single <p> it collapsed into a wall of prose, which is
                    the opposite of what a conversation is for. */}
                {t.answer.text.split('\n\n').map((para, i) => (
                  <p key={i} className="gr-type-body gr-assist__para">{para}</p>
                ))}
                {/* 🐛 `evidence &&` rendered the panel for an EMPTY array too,
                    so a refusal -- which uses no figures by definition -- drew a
                    "Figures used" heading over nothing. An empty labelled box
                    reads as a thing that failed to load. */}
                {t.answer.evidence && t.answer.evidence.length > 0 && (
                  <div className="gr-assist__evidence">
                    <p className="gr-assist__evidence-head gr-type-overline">Figures used</p>
                    {t.answer.evidence.map((e, i) => (
                      <p key={i} className="gr-assist__row gr-type-caption">
                        {e.channel && e.channel !== 'all' && (
                          <ChannelMark channel={e.channel} size={14} />
                        )}
                        <span className="gr-assist__row-label">{e.label}</span>
                        <span className="gr-assist__row-value gr-type-caption-med">{e.value}</span>
                      </p>
                    ))}
                  </div>
                )}
                {/* ⭐ The conversation ends in a DECISION, not in a good
                    sentence. Agreeing with "pause this ad" and then having to go
                    find the Decisions screen to act is a seam in front of the one
                    moment the panel exists for.

                    ⚠️ Tier 1 and 2 only -- a tier 3 finding is a question and
                    there is nothing to take. A button there would turn the
                    refusal back into the recommendation it exists to prevent. */}
                {/* ⚠️ Renders when `decisions` EXISTS, not when it has items.
                    An empty array means "this was a decision question and there
                    is nothing to offer" — and that is precisely when a reader
                    most needs the write-in, because they may act anyway and the
                    engine has just told them it has no opinion. Treating empty
                    as absent removed the escape hatch at the one moment it
                    mattered. */}
                {t.answer.decisions && (
                  <div className="gr-assist__decisions">
                    {/* ⭐ The agent ASKS, rather than labelling a control group.
                    
                        This was an uppercase overline — "TAKE ANY OF THESE" —
                        which reads as a form header on a panel where everything
                        above it is speech. The block appeared beside the answer
                        without belonging to it, so the buttons arrived out of
                        nowhere rather than as the next beat of the conversation.
                        
                        ⚠️ And the empty state carried TWO prompts: an overline
                        saying "Decide anyway" above a link saying "Make a
                        decision". One question, one action. */}
                    <p className="gr-assist__ask gr-type-body">
                      {t.answer.decisions.length === 0
                        ? 'Nothing here I\u2019d suggest \u2014 but if you\u2019ve decided '
                          + 'something anyway, write it down and I\u2019ll add it to your queue.'
                        : t.answer.decisions.length === 1
                          ? 'Want me to put this on your queue?'
                          : 'Want me to put any of these on your queue?'}
                    </p>
                    {t.answer.decisions.map((d) => {
                      const taken = isFlagged('decision', d.id);
                      return (
                        <span key={d.id} className="gr-assist__decision">
                          <button
                            type="button"
                            className={`gr-assist__take gr-type-caption ${taken ? 'is-taken' : ''}`}
                            onClick={() => (taken
                              ? removeFlag('decision', d.id)
                              : addFlag('decision', d.id, d.action, {
                                target: d.target,
                                /* The number it should move, captured NOW --
                                   see grading.ts. */
                                baseline: (() => {
                                  const cand = decisions(range).find((x) => x.id === d.id);
                                  return cand ? baselineFor(cand, range) : undefined;
                                })(),
                              }))}
                          >
                            {taken ? '✓ On your queue' : 'Make the decision'}
                          </button>
                          <span className="gr-assist__decision-label gr-type-caption">
                            {/* ⚠️ NO channel mark here, deliberately.
                                
                                The context beside it already NAMES the channel —
                                "Paid Search › Non-brand — High Intent" — so a
                                logo was the same fact twice in a row that has
                                room for neither. It also competed with the button
                                for the eye, in a block whose job is to make one
                                action obvious.
                                
                                The marks stay everywhere they earn their place:
                                the evidence rows, the tables, and the Decisions
                                cards, where the breadcrumb has room to carry one
                                and the layout is not a single tight line. */}
                            <span className="gr-assist__decision-text">{d.action}</span>
                            {d.context && (
                              <span className="gr-assist__decision-ctx">{d.context}</span>
                            )}
                          </span>
                        </span>
                      );
                    })}

                    {/* ⭐ Or decide something else entirely.

                        The engine proposes; a person decides. An agent that only
                        lets you accept its own suggestions is a menu, and the most
                        useful thing a reader can do with three findings is often a
                        fourth thing none of them said. Written decisions land in
                        the same queue, marked as the reader's own. */}
                    {/* ⚠️ It never opens itself. Auto-opening put an empty input
                        and an "Add it" button in front of a reader who had not
                        asked for either — the panel offering to record a decision
                        before they had decided anything. The link is the offer;
                        the form is the response to it. */}
                    {/* The subject this answer was about travels with the
                        decision, so a written one lands with the same context an
                        engine one carries. */}
                    <OwnDecision
                      offered={t.answer.decisions.length > 0}
                      subject={t.subject}
                      range={range}
                    />
                  </div>
                )}

                {/* Where to go next. The thing that makes this a conversation
                    rather than a search box -- and after a refusal it is the most
                    valuable control on screen, because "so what WOULD tell me?"
                    is the question a reader is least likely to think of and most
                    needs to ask. */}
                {t.answer.followUps && t.answer.followUps.length > 0 && (
                  <div className="gr-assist__followups">
                    <p className="gr-assist__evidence-head gr-type-overline">Ask next</p>
                    {t.answer.followUps.map((f) => (
                      <button key={f} type="button"
                              className="gr-assist__suggestion gr-type-caption"
                              onClick={() => submit(f)}>
                        {f}
                      </button>
                    ))}
                  </div>
                )}
                {t.answer.sources && t.answer.sources.length > 0 && (
                  <div className="gr-assist__sources">
                    <p className="gr-assist__evidence-head gr-type-overline">
                      Outside this dashboard
                    </p>
                    {t.answer.sources.map((src) => (
                      <a key={src.url} className="gr-assist__source gr-type-caption"
                         href={src.url} target="_blank" rel="noreferrer noopener">
                        {src.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div className="gr-assist__turn">
              <p className="gr-assist__q gr-type-body-medium">{pending}</p>
              <div className="gr-assist__a">
                <p className="gr-assist__thinking gr-type-body" aria-live="polite">
                  <span className="gr-assist__pip" /><span className="gr-assist__pip" /><span className="gr-assist__pip" />
                  <span>Reading the data…</span>
                </p>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="gr-assist__composer">
          <textarea
            ref={inputRef}
            className="gr-assist__input gr-type-body"
            rows={1}
            placeholder={pending ? 'Working…' : 'Ask about this data…'}
            disabled={!!pending}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(draft); }
            }}
          />
          <button type="button" className="gr-assist__send" onClick={() => submit(draft)}
                  disabled={!draft.trim() || !!pending} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
                 strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 11.5V2.5M3 6.5L7 2.5l4 4" />
            </svg>
          </button>
        </div>

        <p className="gr-assist__foot gr-type-micro">
          {hasModel === null
            ? 'Every answer is computed from this dashboard\u2019s own data.'
            : hasModel
              ? 'Claude answers, but only through tools that read this dashboard\u2019s data \u2014 it cannot state a figure the product cannot show.'
              : 'No model behind this \u2014 answers are computed from the dashboard\u2019s own data.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Write a decision the engine did not propose.
 *
 * ⭐ WHAT YOU WRITE STAYS ON SCREEN, exactly like what you accept.
 *
 * 🐛 It used to submit and vanish: the form closed, the decision went to the
 * queue, and the panel showed nothing. An engine decision stays put with "✓ On
 * your queue" beside it, so a written one disappearing read as the click having
 * failed — the two kinds behaved differently at the only moment they should have
 * behaved the same.
 *
 * ⚠️ Held in local state rather than read back from the store, because the store
 * holds every decision ever made and this block is about THIS turn. Rendering all
 * of them here would make a fresh answer inherit the whole history.
 *
 * Deliberately small and last: it is the escape hatch, not the primary path.
 */
function OwnDecision({ offered, subject, range }: {
  offered: boolean;
  subject?: Target;
  range: Range;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  /* What was written from THIS answer, so it can stay previewed. */
  const [added, setAdded] = useState<{ id: string; label: string }[]>([]);

  function commit(raw: string) {
    const v = raw.trim();
    if (!v) return;
    const id = ownDecisionId(v);
    /* Same store, same queue — marked as the reader's own rather than an
       accepted proposal, because "I decided this" and "I agreed with the engine"
       are different claims and the queue already separates the kinds of
       attention it holds. */
    /* ⭐ The figures the reader was looking at when they decided — captured
       NOW, not looked up when the card renders. Re-deriving later would restate
       the decision against numbers that have since moved. */
    const ctx = figuresFor(
      subject ?? { kind: 'account', id: 'account' }, range,
    );
    addFlag('decision', id, v, {
      /* What it was written about, so the card can take you back there. */
      target: subject ?? { kind: 'account', id: 'account', label: 'All channels' },
      scope: ctx.scope,
      channel: ctx.channel,
      evidence: ctx.evidence,
    });
    setAdded((prev) => (prev.some((a) => a.id === id) ? prev : [...prev, { id, label: v }]));
    setText('');
    setOpen(false);
  }

  return (
    <>
      {/* Previewed the same way an accepted finding is: same button, same state,
          same row. Undo removes it from the queue and from here. */}
      {added.map((a) => {
        const taken = isFlagged('decision', a.id);
        return (
          <span key={a.id} className="gr-assist__decision">
            <button
              type="button"
              className={`gr-assist__take gr-type-caption ${taken ? 'is-taken' : ''}`}
              onClick={() => (taken
                ? removeFlag('decision', a.id)
                : addFlag('decision', a.id, a.label))}
            >
              {taken ? '✓ On your queue' : 'Make the decision'}
            </button>
            <span className="gr-assist__decision-label gr-type-caption">
              <span className="gr-assist__decision-text">{a.label}</span>
              <span className="gr-assist__decision-ctx">Yours</span>
            </span>
          </span>
        );
      })}

      {/* ⭐ The label follows what has actually happened, because "another"
          claims a first one existed.

          Nothing offered and nothing written  -> "Make a decision"
          Something offered, or already written -> "Make another decision"

          "Decide something anyway" was wrong in both directions: pushy when there
          was simply nothing to suggest, and nonsense once the reader had already
          taken every offer — there was no "anyway" about it. */}
      {open ? (
        <form
          className="gr-assist__own"
          onSubmit={(e) => { e.preventDefault(); commit(text); }}
        >
          <input
            className="gr-assist__own-input gr-type-caption"
            placeholder="What are you actually going to do?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <button type="submit" className="gr-assist__take gr-type-caption">Add it</button>
        </form>
      ) : (
        <button type="button" className="gr-assist__own-open gr-type-caption"
                onClick={() => setOpen(true)}>
          + {offered || added.length > 0 ? 'Make another decision' : 'Make a decision'}
        </button>
      )}
    </>
  );
}
