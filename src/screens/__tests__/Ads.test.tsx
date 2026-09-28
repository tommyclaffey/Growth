// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Ads } from '../Ads';
import { rankedAds } from '../../data/adRanking';
import { ALL_CHANNELS } from '../../data/blended';
import { CHANNEL_KEYS, setActiveChannels } from '../../data/metrics';
import { setChannels } from '../../data/channels';

/** Output, not data — a green ranking suite cannot see an empty table. */
afterEach(cleanup);

function rows(container: HTMLElement) {
  return container.querySelectorAll('tbody tr');
}

describe('Ads renders the ranking', () => {
  it('renders one row per ad, with matching column counts', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    const { container } = render(<Ads range={30} />);
    const expected = rankedAds('CAC', 'relative', 30, ALL_CHANNELS).length;
    expect(rows(container)).toHaveLength(expected);

    /* A table whose body has more cells than its head has columns lays out
       wrong in a way nothing else catches -- this shipped once already as a
       <td> with display:flex. */
    const ths = container.querySelectorAll('thead th').length;
    const tds = rows(container)[0].querySelectorAll('td').length;
    expect(tds).toBe(ths);
  });

  it('shows the argument for the default ranking, not just the ranking', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    render(<Ads range={30} />);
    /* An argument nobody can find is one that was not made. */
    expect(screen.getByText(/beats the average ad on its own channel/i)).toBeTruthy();
  });

  it('switching to Raw value reorders the table and drops the explanation', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    const { container } = render(<Ads range={30} />);
    const before = [...rows(container)].map((r) => r.textContent);

    fireEvent.click(screen.getByRole('button', { name: /raw value/i }));

    const after = [...rows(container)].map((r) => r.textContent);
    expect(after).not.toEqual(before);
    expect(screen.queryByText(/beats the average ad on its own channel/i)).toBeNull();
  });

  it('the mode chips announce which is active', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    render(<Ads range={30} />);
    /* Selection communicated by colour alone is selection a screen reader
       cannot report. */
    expect(screen.getByRole('button', { name: /vs its channel/i })
      .getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /raw value/i })
      .getAttribute('aria-pressed')).toBe('false');
  });

  it('only offers metrics every channel reports', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    const { container } = render(<Ads range={30} />);
    const opts = [...container.querySelectorAll('.gr-ads__select option')].map((o) => o.textContent);
    expect(opts).toEqual(['Spend', 'Leads', 'CAC', 'ROAS']);
    /* CTR would exclude podcasts and affiliates and still say "All ads". */
    expect(opts).not.toContain('CTR');
  });

  it('opening an ad reports the ad that was clicked', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    const onOpenAd = vi.fn();
    const { container } = render(<Ads range={30} onOpenAd={onOpenAd} />);
    const top = rankedAds('CAC', 'relative', 30, ALL_CHANNELS)[0];
    const btn = rows(container)[0].querySelector('button')!;
    fireEvent.click(btn);
    expect(onOpenAd).toHaveBeenCalledWith(top.creative.id);
  });

  it('an empty account says why rather than showing a bare table', () => {
    /* ⚠️ Driven through `setChannels`, not `setActiveChannels`.

       There are two doors to "which channels are on": channels.ts owns the
       persisted choice and pushes it into metrics.ts, which holds the runtime
       list. The screen subscribes to the FORMER, because that is the one that
       fires an event when Settings changes it. Calling the latter in a test
       moves the runtime list while the hook keeps reporting the stored one, and
       the component never re-renders -- which is exactly what the first version
       of this test did, and it looked like a broken empty state. */
    setChannels([]);
    render(<Ads range={30} />);
    expect(screen.getByText(/No channels are switched on/i)).toBeTruthy();
    setChannels([...CHANNEL_KEYS]);
  });
});
