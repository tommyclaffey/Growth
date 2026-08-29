import { useEffect, useRef, useState } from 'react';
import './Assistant.css';
import { SUGGESTIONS, type Answer } from '../../data/assistant';
import { askAssistant, probeModel, type AnswerSource } from '../../data/assistantClient';
import { RANGE_LABEL, type Range } from '../../data/metrics';

const CSS_CHANNEL: Record<string, string> = {
  meta: 'meta', tiktok: 'tiktok', youtube: 'youtube',
  affiliates: 'affiliates', paidSearch: 'paid-search', podcasts: 'podcasts',
};

interface Turn { id: number; question: string; answer: Answer; source: AnswerSource }

export interface AssistantProps {
  open: boolean;
  onClose: () => void;
  range: Range;
}

/**
 * Assistant overlay — a prototype, deliberately.
 *
 * Built to test the input and the shape of a response before any of it is
 * designed properly. Everything it says is computed from the dashboard's own
 * data functions, and every answer shows the figures it used, so the panel
 * can never state a number the product cannot show.
 */
export function Assistant({ open, onClose, range }: AssistantProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  /* Whether a model is reachable. Probed, not inferred from the last answer —
     the footer makes a claim to the user, so it has to be checked. `null` is
     "not yet known", and the footer stays silent about the engine until it is. */
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (open && hasModel === null) void probeModel().then(setHasModel);
  }, [open, hasModel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, pending]);

  if (!open) return null;

  async function submit(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setDraft('');
    setPending(q);
    const { answer, source: src } = await askAssistant(q, range);
    /* The probe can be optimistic — a key can be present but the call can still
       fail and fall back. Let what actually happened correct the claim. */
    if (src === 'local' && hasModel) setHasModel(false);
    setPending(null);
    setTurns((prev) => [...prev, { id: prev.length, question: q, answer, source: src }]);
  }

  return (
    <div className="gr-assist__scrim" onClick={onClose} role="presentation">
      <div
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
                Ask about spend, leads, CAC or ROAS by channel. I answer from the numbers
                on these screens and show my working.
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
                <p className="gr-type-body">{t.answer.text}</p>
                {t.answer.evidence && (
                  <div className="gr-assist__evidence">
                    <p className="gr-assist__evidence-head gr-type-overline">Figures used</p>
                    {t.answer.evidence.map((e, i) => (
                      <p key={i} className="gr-assist__row gr-type-caption">
                        {e.channel && e.channel !== 'all' && (
                          <span className="gr-assist__dot"
                                style={{ background: `var(--channel-${CSS_CHANNEL[e.channel]})` }}
                                aria-hidden="true" />
                        )}
                        <span className="gr-assist__row-label">{e.label}</span>
                        <span className="gr-assist__row-value gr-type-caption-med">{e.value}</span>
                      </p>
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
