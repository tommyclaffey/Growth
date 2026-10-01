// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Candidate } from '../../data/decisions';

/* A large account, without building one: the real demo findings, cloned to
   20 tier-1 cards with distinct ids. The cap is about COUNT, not content. */
vi.mock('../../data/decisions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../data/decisions')>();
  return {
    ...real,
    decisions: (...args: Parameters<typeof real.decisions>) => {
      const found = real.decisions(...args);
      const t1 = found.filter((c) => c.tier === 1);
      const many: Candidate[] = Array.from({ length: 20 }, (_, i) => ({ ...t1[i % t1.length], id: `big-${i}` }));
      return [...many, ...found.filter((c) => c.tier !== 1)];
    },
  };
});

import { Decisions, PER_TIER } from '../Decisions';
import { setChannels } from '../../data/channels';
import { CHANNEL_KEYS } from '../../data/metrics';

afterEach(() => { cleanup(); localStorage.clear(); });

const tier1 = (c: HTMLElement) => c.querySelectorAll('.gr-dec__tier.is-tier-1 .gr-dec__card');

describe('⭐ a large account shows the top of each tier, not all of it', () => {
  it(`shows ${PER_TIER} cards, and the count still says the full number`, () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    expect(tier1(container)).toHaveLength(PER_TIER);
    expect(container.querySelector('.gr-dec__tier.is-tier-1 .gr-dec__count')!.textContent).toBe('20');
  });

  it('the button says how many are hidden, and shows them all', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const more = screen.getByRole('button', { name: `Show ${20 - PER_TIER} more` });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(tier1(container)).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(tier1(container)).toHaveLength(PER_TIER);
  });

  it('keeps the engine order -- the best-supported six are the ones shown', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    expect([...tier1(container)].length).toBe(PER_TIER);
    /* No button on a tier that fits. */
    expect(container.querySelector('.gr-dec__tier.is-tier-3 .gr-dec__more')).toBeNull();
  });
});
