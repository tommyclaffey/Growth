// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdSetDetail } from '../AdSetDetail';
import { CAMPAIGNS } from '../../data/campaigns';
import { CHANNEL_DEPTH } from '../../data/channelDepth';
import { kpisFor } from '../../data/channelMetrics';

/**
 * The tier that used to have no page, asserted as OUTPUT.
 *
 * A green data suite proved the numbers reconcile. It could not prove the page
 * renders them -- and this codebase has shipped that exact gap before: an
 * element removed from one branch and never added back, with every test still
 * passing because they all asserted data instead of what appeared on screen.
 */
afterEach(cleanup);

/* Meta: an ad set proper, with the richest metric vocabulary. */
const META = CAMPAIGNS.find((c) => c.channel === 'meta')!;
/* Podcasts: the channel whose middle tier is NOT an ad set. */
const POD = CAMPAIGNS.find((c) => c.channel === 'podcasts')!;

describe('AdSetDetail renders the ad set', () => {
  it('shows the ad set name and its campaign', () => {
    const a = META.adSets[0];
    const { container } = render(
      <AdSetDetail id={a.id} range={30} metric="Spend" onBack={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: a.name })).toBeTruthy();
    /* Read the meta line's text directly rather than matching a pattern built
       from the campaign name. "Advantage+ — Evergreen Signups" contains a `+`,
       which is a quantifier in a RegExp -- the first version of this test built
       one from the name and failed on a page that was rendering correctly. */
    const meta = container.querySelector('.gr-campaign__meta');
    expect(meta?.textContent).toContain(META.name);
  });

  it('renders one KPI card per metric the objective and channel agree on', () => {
    const a = META.adSets[0];
    const { container } = render(
      <AdSetDetail id={a.id} range={30} metric="Spend" onBack={() => {}} />,
    );
    const expected = kpisFor(META.channel, META.objective);
    const row = container.querySelector('.gr-kpi-row')!;
    expect(row.querySelectorAll('.gr-kpi')).toHaveLength(expected.length);
    /* Not just the right COUNT -- the right ones. A card row of the correct
       length showing the wrong metrics would pass a count assertion.

       Scoped to the KPI row on purpose: "Spend" also appears in the chart's
       metric toggle further down the page, so an unscoped query matches two
       elements and throws. Two legitimate appearances of one word is not an
       ambiguity in the product, only in the query. */
    const labels = [...row.querySelectorAll('.gr-kpi__label')].map((n) => n.textContent);
    for (const m of expected) expect(labels).toContain(m);
  });

  it('draws a chart', () => {
    const a = META.adSets[0];
    const { container } = render(
      <AdSetDetail id={a.id} range={30} metric="Spend" onBack={() => {}} />,
    );
    expect(container.querySelector('.gr-chart')).toBeTruthy();
  });

  it('shows only the ads belonging to THIS ad set', () => {
    /* The thing that makes it a level rather than a copy of its parent. */
    const a = META.adSets[0];
    const { container } = render(
      <AdSetDetail id={a.id} range={30} metric="Spend" onBack={() => {}} />,
    );
    const cards = container.querySelectorAll('.gr-creative');
    expect(cards.length).toBeGreaterThan(0);
    /* A sibling ad set's name must not appear anywhere on the page. */
    const sibling = META.adSets[1];
    if (sibling) expect(screen.queryByText(sibling.name)).toBeNull();
  });
});

describe('AdSetDetail speaks the platform’s vocabulary', () => {
  it('calls a Meta ad set an “Ad set”', () => {
    const a = META.adSets[0];
    render(<AdSetDetail id={a.id} range={30} metric="Spend" onBack={() => {}} />);
    expect(screen.getByText(new RegExp(CHANNEL_DEPTH.meta.group.one))).toBeTruthy();
  });

  it('calls a podcast’s middle tier a “Show”, never an ad set', () => {
    /* ⭐ The whole point of CHANNEL_DEPTH. A podcast buyer has no ad sets, and
       printing the word is the same defect as printing a CTR for an audio ad. */
    const a = POD.adSets[0];
    render(<AdSetDetail id={a.id} range={30} metric="Spend" onBack={() => {}} />);
    expect(screen.getByText(new RegExp(CHANNEL_DEPTH.podcasts.group.one))).toBeTruthy();
    expect(screen.queryByText(/Ad set/i)).toBeNull();
  });
});

describe('AdSetDetail handles a bad id', () => {
  it('says so and offers a way out rather than rendering blank', () => {
    const onBack = vi.fn();
    render(<AdSetDetail id="nope" range={30} metric="Spend" onBack={onBack} />);
    expect(screen.getByText(/no longer exists/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /back to/i })).toBeTruthy();
  });
});

describe('🐛 share of campaign spend follows the date range', () => {
  it('is the ranged ad-set spend over the ranged campaign spend', async () => {
    const { adSetTotals } = await import('../../data/adSets');
    const { campaignTotals } = await import('../../data/campaignSeries');
    const a = META.adSets[0];
    for (const range of [7, 90] as const) {
      cleanup();
      const { container } = render(<AdSetDetail id={a.id} range={range} metric="Spend" onBack={() => {}} />);
      const pct = Math.round((adSetTotals(a.id, range).spend / campaignTotals(META.id, range).spend) * 100);
      expect(container.textContent).toContain(`${pct}% of campaign spend`);
    }
  });
});
