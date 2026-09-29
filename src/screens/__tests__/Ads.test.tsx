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
    /* Live ads by default -- paused ones ranked on whole-period figures were
       taking the top three places. */
    const expected = rankedAds('CAC', 'relative', 30, ALL_CHANNELS)
      .filter((r) => r.creative.stage === 'Active').length;
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
    expect(screen.getByText(/against the average ad on its own channel/i)).toBeTruthy();
  });

  it('switching to Raw value reorders the table and drops the explanation', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    const { container } = render(<Ads range={30} />);
    const before = [...rows(container)].map((r) => r.textContent);

    fireEvent.click(screen.getByRole('button', { name: /raw value/i }));

    const after = [...rows(container)].map((r) => r.textContent);
    expect(after).not.toEqual(before);
    expect(screen.queryByText(/against the average ad on its own channel/i)).toBeNull();
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
    const top = rankedAds('CAC', 'relative', 30, ALL_CHANNELS)
      .filter((r) => r.creative.stage === 'Active')[0];
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

  it('the Ask cell carries its own type size, and text columns can wrap', () => {
    /* Ask inherited the page default font because nothing on its row set one,
       and seven nowrap columns pushed it past the card edge. */
    setActiveChannels([...CHANNEL_KEYS]);
    const { container } = render(<Ads range={30} onAskAbout={() => {}} />);
    const row = rows(container)[0];
    const ask = row.querySelector('td.gr-table__ask');
    expect(ask?.className).toMatch(/\bgr-type-/);
    expect(row.querySelectorAll('td.gr-ads__wrap')).toHaveLength(2);
    expect(container.querySelector('.gr-table-scroll > table.gr-table')).not.toBeNull();
  });

  it('hides paused ads by default; "Show paused" brings them and the Status column back', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    const { container } = render(<Ads range={30} />);
    const all = rankedAds('CAC', 'relative', 30, ALL_CHANNELS);
    const paused = all.filter((r) => r.creative.stage !== 'Active').length;
    expect(paused).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/Paused/);
    expect([...container.querySelectorAll('thead th')].map((t) => t.textContent)).not.toContain('Status');

    fireEvent.click(screen.getByRole('button', { name: `Show paused ${paused}` }));
    expect(rows(container)).toHaveLength(all.length);
    expect([...container.querySelectorAll('thead th')].map((t) => t.textContent)).toContain('Status');
    expect(rows(container)[0].querySelectorAll('td').length)
      .toBe(container.querySelectorAll('thead th').length);
  });

  it('an ad with no artwork names its real format, never "Text" on a video', () => {
    setActiveChannels([...CHANNEL_KEYS]);
    const { container } = render(<Ads range={30} />);
    const live = rankedAds('CAC', 'relative', 30, ALL_CHANNELS).filter((r) => r.creative.stage === 'Active');
    [...rows(container)].forEach((tr, i) => {
      const tile = tr.querySelector('.gr-ads__thumb--none');
      if (!tile) return;
      const kind = live[i].creative.kind;
      expect(tile.textContent!.toLowerCase()).toBe(kind);
    });
  });
});
