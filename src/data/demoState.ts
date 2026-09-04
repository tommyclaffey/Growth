import { useEffect, useState } from 'react';

/**
 * An explicit switch for the loading, error and empty states.
 *
 * Those states are built -- KpiCard has a skeleton, Chart has all three -- and
 * until now nothing could reach them. The data layer is synchronous seeded
 * computation, so there is no request to be slow and nothing to fail. Roughly
 * thirty lines of the most careful work in the repo were unreachable, and a
 * reviewer clicking through would never have seen them.
 *
 * The alternative was faking latency with a setTimeout. That is worse: it slows
 * the product down permanently to demonstrate something occasionally, and it
 * lies about where the states come from. A labelled switch is honest about
 * being a demonstration -- which is what a design system does anyway, since
 * this is the same affordance a Storybook control provides.
 *
 * Deliberately NOT persisted. Every other preference here survives a reload;
 * this one must not, or someone flips it, forgets, and reads a permanently
 * broken dashboard as a bug.
 */
export type DemoState = 'ready' | 'loading' | 'error' | 'empty';

const CHANGED = 'growth:demostate';
let current: DemoState = 'ready';

export function demoState(): DemoState {
  return current;
}

export function setDemoState(next: DemoState) {
  current = next;
  window.dispatchEvent(new Event(CHANGED));
}

export function useDemoState(): DemoState {
  const [s, setS] = useState<DemoState>(current);
  useEffect(() => {
    const sync = () => setS(current);
    window.addEventListener(CHANGED, sync);
    return () => window.removeEventListener(CHANGED, sync);
  }, []);
  return s;
}
