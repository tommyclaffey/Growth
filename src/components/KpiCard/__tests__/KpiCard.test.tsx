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
