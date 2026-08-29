import { useEffect, useRef, useState } from 'react';
import './Assistant.css';
import { ask, SUGGESTIONS, type Answer } from '../../data/assistant';
import { RANGE_LABEL, type Range } from '../../data/metrics';

const CSS_CHANNEL: Record<string, string> = {
  meta: 'meta', tiktok: 'tiktok', youtube: 'youtube',
  affiliates: 'affiliates', paidSearch: 'paid-search', podcasts: 'podcasts',
};

interface Turn { id: number; question: string; answer: Answer }

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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length]);

  if (!open) return null;

  function submit(text: string) {
    const q = text.trim();
    if (!q) return;
    setTurns((prev) => [...prev, { id: prev.length, question: q, answer: ask(q, range) }]);
    setDraft('');
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
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="gr-assist__composer">
          <textarea
            ref={inputRef}
            className="gr-assist__input gr-type-body"
            rows={1}
            placeholder="Ask about this data…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(draft); }
            }}
          />
          <button type="button" className="gr-assist__send" onClick={() => submit(draft)}
                  disabled={!draft.trim()} aria-label="Send">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
                 strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 11.5V2.5M3 6.5L7 2.5l4 4" />
            </svg>
          </button>
        </div>

        <p className="gr-assist__foot gr-type-micro">
          No model behind this — answers are computed from the dashboard's own data.
        </p>
      </div>
    </div>
  );
}
