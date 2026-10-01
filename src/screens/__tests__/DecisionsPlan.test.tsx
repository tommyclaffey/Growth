// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Decisions } from '../Decisions';
import { setChannels } from '../../data/channels';
import { CHANNEL_KEYS } from '../../data/metrics';
import { flags, removeFlag } from '../../data/attention';
import { heldBack } from '../../data/decisions';
import { ALL_CHANNELS } from '../../data/blended';

afterEach(() => {
  cleanup();
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
});

describe('⭐ the plan card', () => {
  it('leads with the sum: leads, spend and cost per lead, before → after', () => {
    setChannels([...CHANNEL_KEYS]);
    render(<Decisions range={30} />);
    const plan = screen.getByRole('region', { name: "This week's plan" });
    expect(plan.textContent).toMatch(/Take the \d+ ready moves: \+\d+ leads a week on \$[\d,]+ less/);
    expect(plan.textContent).toMatch(/Cost per lead\$41\.08 → \$\d+\.\d\d/);
    expect(plan.textContent).toMatch(/assumed where its spend has not moved enough to measure/);
  });

  it('"Accept all" takes every move with money in it, and the plan empties', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const plan = screen.getByRole('region', { name: "This week's plan" });
    const n = Number(plan.textContent!.match(/Take the (\d+) ready moves/)![1]);
    fireEvent.click(within(plan).getByRole('button', { name: `Accept all ${n}` }));
    expect(flags().filter((f) => f.kind === 'decision')).toHaveLength(n);
    expect(screen.queryByRole('region', { name: "This week's plan" })).toBeNull();
    const decided = [...container.querySelectorAll('.gr-dec__tier')].find((s) => /Decided/.test(s.querySelector('h3')?.textContent ?? ''));
    expect(decided?.querySelectorAll('.gr-dec__card').length).toBe(n);
  });
});

describe('held back, and why', () => {
  it('the button counts them and the list gives each one its reason', () => {
    setChannels([...CHANNEL_KEYS]);
    render(<Decisions range={30} />);
    const n = heldBack(30, ALL_CHANNELS).length;
    expect(n).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: `Held back (${n})` }));
    const sec = screen.getByRole('region', { name: 'Held back' });
    expect(sec.textContent).toMatch(/Branded Search Defense/);
    expect(sec.textContent).toMatch(/More budget here costs more than it is worth/);
  });
});

describe('confidence on the card', () => {
  it('every card whose claim compares two things says how sure it is', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const lines = [...container.querySelectorAll('.gr-dec__confidence')];
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l.textContent).toMatch(/^(High|Medium) confidence \S.* leads/);
  });
});
