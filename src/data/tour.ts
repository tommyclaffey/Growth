import { useSyncExternalStore } from 'react';
import type { NavKey } from '../components/Sidebar/nav';

/**
 * The demo guide (Oct 9): a walk through the real screens, one feature at a
 * time. Each stop names the screen it lives on and the [data-tour] element it
 * points at -- a marker, not a style class, so restyling never breaks it.
 */
export interface TourStop {
  /** Screen to be on first. Absent = whatever screen you're on. */
  screen?: NavKey;
  target: string;
  title: string;
  body: string;
}

export const TOUR: TourStop[] = [
  { screen: 'overview', target: 'kpis', title: 'The numbers that matter',
    body: 'Spend, leads, cost per lead and return, blended across every channel. Each badge compares with the period before.' },
  { screen: 'overview', target: 'attention', title: 'What changed',
    body: 'Growth flags the swings worth a look. Click one to jump to the view behind it.' },
  { screen: 'overview', target: 'channels', title: 'Every channel, side by side',
    body: 'Click a row to drill from a channel into its campaigns, ad sets and single ads.' },
  { screen: 'decisions', target: 'plan', title: 'The plan for this week',
    body: 'Growth turns the numbers into moves: budget out of what is wasting it, into what works, with the net effect on leads.' },
  { screen: 'decisions', target: 'decision', title: 'One move, fully argued',
    body: 'What to do, why, and what it would change. Accept it, assign it to someone on the team, or dismiss it.' },
  { screen: 'decisions', target: 'confidence', title: 'How sure it is',
    body: 'Every move says whether the difference is real or could be chance. Weak evidence is held back, never dressed up.' },
  { target: 'ask', title: 'Ask AI',
    body: 'Ask in plain English, like "why did Meta get expensive?" Answers are worked out from this dashboard, never made up.' },
  { target: 'team', title: 'Your team',
    body: 'Share a chart or a decision into the team chat, give moves an owner, and send reports.' },
  { target: 'demo', title: 'That’s the tour',
    body: 'Click DEMO anytime for the welcome card or to take the tour again. Everything here is yours to click.' },
];

let step: number | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function startTour() { step = 0; emit(); }
export function endTour() { step = null; emit(); }
export function setTourStep(i: number) { step = i >= 0 && i < TOUR.length ? i : null; emit(); }
export function useTourStep(): number | null {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => step,
    () => step,
  );
}
