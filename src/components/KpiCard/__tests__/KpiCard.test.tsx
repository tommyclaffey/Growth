// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { KpiCard } from '../KpiCard';

/**
 * These exist because of a regression nothing else could see.
 *
 * The benchmark pill was removed from one row and never added to the other, so
 * a campaign KPI card rendered a label, a value and NO percentage at all.
 * TypeScript was happy, the linter was happy, and 89 tests passed -- because
 * valid code with a missing element is still valid code, and every test in the
 * suite asserted DATA rather than OUTPUT.
 *
 * A card's whole job is what it displays. That has to be assertable.
 */
/* Explicit, because testing-library only auto-registers cleanup when vitest
   runs with `globals: true`. This project imports describe/it directly, so
   without this every render stacks in the same document and `screen` starts
   matching elements from the previous test. */
afterEach(cleanup);

function pills(root: HTMLElement) {
  return root.querySelectorAll('.gr-delta');
}

describe('KpiCard shows exactly one percentage', () => {
  it('renders the period delta when it has one', () => {
    const { container } = render(<KpiCard label="Spend" value="$34,120" deltaPercent={3} />);
    expect(pills(container)).toHaveLength(1);
    expect(screen.getByText(/3%/)).toBeTruthy();
    expect(screen.getByText('increase')).toBeTruthy();
  });

  it('renders the BENCHMARK pill when there is no delta — the regression', () => {
    const { container } = render(
      <KpiCard label="Spend" value="$34,120"
               benchmark={{ percent: 11, note: 'Your Meta avg $30,620' }} />,
    );
    expect(pills(container), 'a card with a benchmark must show a percentage').toHaveLength(1);
    expect(screen.getByText(/11%/)).toBeTruthy();
    /* The benchmark variant says above/below and wears no arrow, so it cannot
       be misread as a change over time. */
    expect(screen.getByText('above')).toBeTruthy();
  });

  it('shows ONE pill when given both, not two', () => {
    const { container } = render(
      <KpiCard label="Spend" value="$34,120" deltaPercent={3}
               benchmark={{ percent: 11, note: 'Your Meta avg $30,620' }} />,
    );
    expect(pills(container)).toHaveLength(1);
    /* The delta wins: a card that has one is an Overview card. */
    expect(screen.getByText('increase')).toBeTruthy();
  });

  it('always states the basis when it shows a benchmark', () => {
    render(<KpiCard label="Spend" value="$34,120"
                    benchmark={{ percent: 11, note: 'Your Meta avg $30,620' }} />);
    expect(screen.getByText('Your Meta avg $30,620')).toBeTruthy();
  });

  it('shows no pill at all when given neither', () => {
    const { container } = render(<KpiCard label="Spend" value="$34,120" />);
    expect(pills(container)).toHaveLength(0);
  });

  it('drops the benchmark in the error state — a comparison against nothing', () => {
    const { container } = render(
      <KpiCard label="Spend" value="$34,120" error
               benchmark={{ percent: 11, note: 'Your Meta avg $30,620' }} />,
    );
    expect(pills(container)).toHaveLength(0);
    expect(screen.queryByText('Your Meta avg $30,620')).toBeNull();
  });

  it('reuses higherIsBetter for the benchmark — a CAC ABOVE average is bad news', () => {
    const { container } = render(
      <KpiCard label="CAC" value="$34.31" higherIsBetter={false}
               benchmark={{ percent: 11, note: 'Your Meta avg $30.62' }} />,
    );
    expect(container.querySelector('.gr-delta.is-bad'), 'above-average CAC must read bad').toBeTruthy();
  });
});

describe('a row of cards keeps one shape', () => {
  /* 🐛 The defect Tommy caught by looking at it: Total spend had no coverage
     line while Impressions, Clicks and CTR did. `.gr-kpi` has `min-height` not
     `height`, so the three with a line grew ~20px, the flex row stretched all
     four to the tallest, and the one without gained a patch of dead space.

     Structural sameness is the assertable form of "the row looks right". */

  function basisCount(root: HTMLElement) {
    return root.querySelectorAll('.gr-kpi__bench').length;
  }

  it('⭐ a reserved card holds the same slot as one with a note', () => {
    /* The fix, stated as the property it has to have: within a row, a card with
       a caveat and a card without occupy the SAME slot. `.gr-kpi` uses
       min-height, so any difference here stretches the row and leaves dead space
       at the bottom of the shorter card. */
    const withNote = render(
      <KpiCard label="Blended CTR" value="0.81%" deltaPercent={0} basis="4 of 6 channels" />,
    );
    expect(basisCount(withNote.container)).toBe(1);
    cleanup();

    const reserved = render(
      <KpiCard label="Total spend" value="$160,780" deltaPercent={1} reserveBasis />,
    );
    expect(basisCount(reserved.container)).toBe(1);
    /* Held open and silent -- it prints nothing and is hidden from assistive
       tech, because announcing an empty region is worse than the gap it exists
       to prevent. */
    const slot = reserved.container.querySelector('.gr-kpi__bench')!;
    expect(slot.textContent).toBe('');
    expect(slot.getAttribute('aria-hidden')).toBe('true');
  });

  it('no reservation means no slot at all', () => {
    /* A channel screen never has a caveat, so its row reserves nothing and the
       cards are uniform without any empty space. */
    const { container } = render(<KpiCard label="CAC" value="$35.94" deltaPercent={-2} />);
    expect(basisCount(container)).toBe(0);
  });

  it('a basis never renders alongside a benchmark — one footer line, one owner', () => {
    const { container } = render(
      <KpiCard
        label="CAC" value="$35.94" basis="4 of 6 channels"
        benchmark={{ percent: -8, note: 'Your Meta avg $29.80' }}
      />,
    );
    expect(basisCount(container)).toBe(1);
    /* The benchmark wins, because it is the one paired with a visible pill that
       would otherwise have no stated basis. */
    expect(container.textContent).toContain('Your Meta avg');
    expect(container.textContent).not.toContain('4 of 6');
  });
});
