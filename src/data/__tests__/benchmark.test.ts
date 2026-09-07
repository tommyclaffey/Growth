import { describe, expect, it } from 'vitest';
import { benchmarkFor } from '../benchmark';
import { CAMPAIGNS } from '../campaigns';
import { totals } from '../metrics';
import { valueOf } from '../channelMetrics';
import { campaignTotals } from '../campaignSeries';
import { decodeView, encodeView, readDeepLink } from '../chat';

describe('benchmarkFor', () => {
  it('divides counts by the campaign count, so the comparison is an average and not a share', () => {
    const n = CAMPAIGNS.filter((c) => c.channel === 'meta').length;
    expect(n).toBeGreaterThan(1);
    const b = benchmarkFor('meta', 'Leads', 30, 0)!;
    expect(b.basis).toBe('campaign-average');
    /* Within a fraction of a percent of the channel total, but NOT equal to
       it -- the benchmark sums the campaigns so a reader can reproduce it from
       the table. */
    const fromChannel = valueOf('Leads', totals('meta', 30)) / n;
    expect(Math.abs(b.value - fromChannel) / fromChannel).toBeLessThan(0.01);
  });

  it('leaves rates alone — a CAC divided by the campaign count would be meaningless', () => {
    const b = benchmarkFor('meta', 'CAC', 30, 40)!;
    expect(b.basis).toBe('channel-rate');
    const fromChannel = valueOf('CAC', totals('meta', 30));
    expect(Math.abs(b.value - fromChannel) / fromChannel).toBeLessThan(0.01);
  });

  it('is spend-weighted, not the mean of each campaign rate', () => {
    const metas = CAMPAIGNS.filter((c) => c.channel === 'meta');
    const naive = metas.reduce((a, c) => {
      const t = campaignTotals(c.id, 30);
      return a + (t.leads > 0 ? t.spend / t.leads : 0);
    }, 0) / metas.length;
    const weighted = benchmarkFor('meta', 'CAC', 30, 40)!.value;
    const sum = metas.reduce((a, c) => {
      const t = campaignTotals(c.id, 30);
      return { spend: a.spend + t.spend, leads: a.leads + t.leads };
    }, { spend: 0, leads: 0 });
    expect(weighted).toBeCloseTo(sum.spend / sum.leads, 6);
    expect(weighted).not.toBeCloseTo(naive, 6);
  });

  it('reads direction from betterHigher, so a CAC ABOVE the average is bad news', () => {
    const avg = benchmarkFor('meta', 'CAC', 30, 1)!.value;
    expect(benchmarkFor('meta', 'CAC', 30, avg * 1.2)!.better).toBe(false);
    expect(benchmarkFor('meta', 'CAC', 30, avg * 0.8)!.better).toBe(true);
    /* The same shape on a metric where up IS good, so the test would fail if
       the rule were hardcoded either way rather than delegated. */
    const leadAvg = benchmarkFor('meta', 'Leads', 30, 1)!.value;
    expect(benchmarkFor('meta', 'Leads', 30, leadAvg * 1.2)!.better).toBe(true);
  });

  it('signs the delta against the benchmark', () => {
    const avg = benchmarkFor('meta', 'Leads', 30, 1)!.value;
    expect(benchmarkFor('meta', 'Leads', 30, avg * 1.5)!.deltaPercent).toBeCloseTo(50, 6);
  });

  it('averages every campaign on the channel, so the average of all campaigns is the benchmark', () => {
    const metas = CAMPAIGNS.filter((c) => c.channel === 'meta');
    const mean = metas.reduce((a, c) => a + campaignTotals(c.id, 30).leads, 0) / metas.length;
    expect(benchmarkFor('meta', 'Leads', 30, 0)!.value).toBeCloseTo(mean, 4);
  });
});

describe('a campaign card survives the round trip through Slack', () => {
  const view = { channel: 'meta' as const, metric: 'CTR' as const, range: 30 as const, campaign: CAMPAIGNS[0].id };

  it('keeps the campaign, so the card does not come back as its whole channel', () => {
    const url = encodeView(view, 'https://x.test');
    expect(readDeepLink(url.slice(url.indexOf('?') + 1))!.view).toEqual(view);
  });

  it('decodes the campaign out of message TEXT, which the regex never captured', () => {
    const url = encodeView(view, 'https://x.test', 'c-123');
    const got = decodeView(`take a look ${url} thoughts?`)!;
    expect(got.view.campaign).toBe(view.campaign);
    expect(got.view.metric).toBe('CTR');
    /* The whole URL is consumed — no query fragment left in the body. */
    expect(got.text).toBe('take a look thoughts?');
  });

  it('drops a campaign id that no longer exists rather than navigating to a dead page', () => {
    const url = encodeView({ ...view, campaign: 'gone' }, 'https://x.test');
    expect(readDeepLink(url.slice(url.indexOf('?') + 1))!.view.campaign).toBeUndefined();
  });

  it('still accepts a plain channel link with no campaign on it', () => {
    const url = encodeView({ channel: 'all', metric: 'Spend', range: 7 }, 'https://x.test');
    expect(readDeepLink(url.slice(url.indexOf('?') + 1))!.view)
      .toEqual({ channel: 'all', metric: 'Spend', range: 7 });
  });
});
