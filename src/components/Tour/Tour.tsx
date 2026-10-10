import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './Tour.css';
import { Button } from '../Button/Button';
import { useOverlay } from '../../data/useOverlay';
import { TOUR, endTour, setTourStep, useTourStep } from '../../data/tour';
import type { NavKey } from '../Sidebar/nav';

export interface TourProps {
  nav: NavKey;
  onGo: (screen: NavKey) => void;
}

type Box = { top: number; left: number; width: number; height: number };
const PAD = 6;
const visible = (el: Element | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};
const find = (target: string) =>
  [...document.querySelectorAll(`[data-tour="${target}"]`)].find(visible) ?? null;

/**
 * The guide itself: a spotlight on the real element and a card beside it.
 *
 * Goes to the stop's screen, waits for its element, scrolls it into view and
 * cuts a hole in the scrim around it. A stop whose element is not on screen
 * (Team is hidden on a phone) is skipped in the direction you were going,
 * rather than pointing at nothing.
 */
export function Tour({ nav, onGo }: TourProps) {
  const step = useTourStep();
  const [box, setBox] = useState<Box | null>(null);
  const dir = useRef(1);
  const card = useRef<HTMLDivElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  useOverlay(step !== null, card, endTour);

  const stop = step === null ? null : TOUR[step];

  /* 1. Be on the right screen. */
  useEffect(() => {
    if (stop?.screen && stop.screen !== nav) onGo(stop.screen);
  }, [stop, nav, onGo]);

  /* 2. Find the element (it may still be rendering), bring it into view,
        or skip the stop if it never shows. */
  useLayoutEffect(() => {
    if (step === null || !stop) { setBox(null); return; }
    if (stop.screen && stop.screen !== nav) return;
    let tries = 0, raf = 0;
    const look = () => {
      const el = find(stop.target);
      if (el) {
        /* On a phone the card docks at the bottom, so the element goes to the top. */
        const phone = window.matchMedia?.('(max-width: 640px)').matches;
        el.scrollIntoView({ block: phone ? 'start' : 'center', behavior: 'instant' as ScrollBehavior });
        measure(el);
        nextBtn.current?.focus();
        return;
      }
      if (++tries < 40) { raf = requestAnimationFrame(look); return; }
      const n = step + dir.current;
      setTourStep(n >= 0 && n < TOUR.length ? n : -1);
    };
    const measure = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    };
    look();
    const follow = () => { const el = find(stop.target); if (el) measure(el); };
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', follow); window.removeEventListener('scroll', follow, true); };
  }, [step, stop, nav]);

  /* Arrow keys, like a slideshow. */
  useEffect(() => {
    if (step === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  if (step === null || !stop) return null;

  const last = step === TOUR.length - 1;
  function go(d: number) {
    if (step === null) return;
    dir.current = d;
    const n = step + d;
    if (n >= TOUR.length) return endTour();
    if (n >= 0) setTourStep(n);
  }

  /* Below the element if it fits, else above; clamped to the screen. */
  const W = 340, vw = window.innerWidth, vh = window.innerHeight;
  const place: React.CSSProperties = {};
  if (box) {
    const below = box.top + box.height + 12;
    place.top = below + 220 < vh ? below : Math.max(12, box.top - 12 - 220);
    place.left = Math.min(Math.max(12, box.left), vw - W - 12);
  }

  return (
    <div className="gr-tour" aria-live="polite">
      {/* Blocks clicks on the page behind; the hole is only visual. */}
      <div className="gr-tour__block" />
      {box && <div className="gr-tour__spot" style={box} aria-hidden="true" />}
      <div ref={card} className={`gr-tour__card ${box ? '' : 'is-waiting'}`} style={place}
           role="dialog" aria-modal="true" aria-labelledby="gr-tour-title" aria-describedby="gr-tour-body">
        <p className="gr-tour__count gr-type-micro">Step {step + 1} of {TOUR.length}</p>
        <h2 id="gr-tour-title" className="gr-tour__title gr-type-card-heading">{stop.title}</h2>
        <p id="gr-tour-body" className="gr-tour__body gr-type-body">{stop.body}</p>
        <div className="gr-tour__dots" aria-hidden="true">
          {TOUR.map((_, i) => <span key={i} className={i === step ? 'is-on' : i < step ? 'is-done' : ''} />)}
        </div>
        <div className="gr-tour__foot">
          <button type="button" className="gr-tour__end gr-type-caption" onClick={endTour}>End tour</button>
          {step > 0 && <Button variant="ghost" onClick={() => go(-1)}>Back</Button>}
          <Button ref={nextBtn} variant="primary" onClick={() => go(1)}>{last ? 'Finish' : 'Next'}</Button>
        </div>
      </div>
    </div>
  );
}
