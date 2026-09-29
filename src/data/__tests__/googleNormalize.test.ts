import { describe, expect, it } from 'vitest';
import {
  accountsFrom, channelOfGoogle, googleErrorMessage, normalizeGoogle, objectiveOfGoogle,
  stageOfGoogleAd, stageOfGoogleCampaign, type GRow,
} from '../sources/googleNormalize';

/*
 * Shaped like Google Ads REST searchStream results, flattened: camelCase,
 * int64 as strings, money in micros, zero-valued fields OMITTED.
 */
const customer = { descriptiveName: 'Acme Search', currencyCode: 'USD', timeZone: 'America/Detroit' };
const now = new Date('2026-09-29T15:00:00Z');   // last complete day in Detroit: Sept 28
const D = '2026-09-28';

const camp = (id: string, name: string, type = 'SEARCH', status = 'ENABLED'): GRow =>
  ({ campaign: { id, name, status, servingStatus: 'SERVING', advertisingChannelType: type } });
const perf = (cid: string, date: string, cost: string, extra: Partial<GRow> = {}): GRow => ({
  campaign: { id: cid }, segments: { date },
  metrics: { costMicros: cost, impressions: '1000', clicks: '50' }, ...extra,
});
const conv = (cid: string, date: string, category: string, n: number, value?: number, extra: Partial<GRow> = {}): GRow => ({
  campaign: { id: cid }, segments: { date, conversionActionCategory: category },
  metrics: { conversions: n, ...(value !== undefined ? { conversionsValue: value } : {}) }, ...extra,
});

describe('Google Ads → product rows', () => {
  it('micros become money; strings become numbers; omitted zeros read as 0', () => {
    const d = normalizeGoogle({
      customer, campaigns: [camp('1', 'Brand')], now, days: 180,
      metrics: [
        perf('1', D, '125500000'),                                        // $125.50
        { campaign: { id: '1' }, segments: { date: '2026-09-27' }, metrics: {} },   // a zero day: every field omitted
      ],
    });
    const rows = d.campaigns![0].rows;
    expect(rows).toHaveLength(180);
    expect(rows[179]).toMatchObject({ spend: 125.5, impressions: 1000, clicks: 50 });
    expect(rows[178]).toEqual({ spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 });
    expect(d.account).toMatchObject({ name: 'Acme Search', currency: 'USD', periodEnd: D });
  });

  it('⭐ leads and sales come from categories -- later lead stages are NOT counted again', () => {
    const d = normalizeGoogle({
      customer, campaigns: [camp('1', 'Brand')], now, days: 180,
      metrics: [
        perf('1', D, '100000000'),
        conv('1', D, 'SUBMIT_LEAD_FORM', 4),
        conv('1', D, 'PHONE_CALL_LEAD', 1.5),         // fractional under data-driven attribution
        conv('1', D, 'QUALIFIED_LEAD', 3),            // the same people, a stage later
        conv('1', D, 'CONVERTED_LEAD', 1),
        conv('1', D, 'PAGE_VIEW', 900),               // not an outcome
        conv('1', D, 'PURCHASE', 2, 310),
        conv('1', D, 'ADD_TO_CART', 7, 999),          // value that is not revenue
      ],
    });
    expect(d.campaigns![0].rows[179]).toMatchObject({ leads: 5.5, sales: 2, revenue: 310 });
  });

  it('"Other" (DEFAULT) conversions count as leads -- uncategorised lead-gen accounts are the common case', () => {
    const d = normalizeGoogle({
      customer, campaigns: [camp('1', 'Brand')], now, days: 180,
      metrics: [perf('1', D, '50000000'), conv('1', D, 'DEFAULT', 3)],
    });
    expect(d.campaigns![0].rows[179].leads).toBe(3);
  });

  it('VIDEO campaigns are YouTube; everything else is paid search. Each channel sums its campaigns', () => {
    const d = normalizeGoogle({
      customer, now, days: 180,
      campaigns: [camp('1', 'Brand'), camp('2', 'Generic'), camp('3', 'YouTube — Explainer', 'VIDEO')],
      metrics: [perf('1', D, '100000000'), perf('2', D, '50000000'), perf('3', D, '70000000')],
    });
    expect(d.rows.paidSearch![179].spend).toBe(150);
    expect(d.rows.youtube![179].spend).toBe(70);
    expect(d.campaigns!.find((c) => c.name === 'YouTube — Explainer')).toMatchObject({ channel: 'youtube', objective: 'Awareness' });
  });

  it('a campaign that delivered but has since been removed keeps its numbers and its name', () => {
    const d = normalizeGoogle({
      customer, now, days: 180, campaigns: [camp('1', 'Brand')],
      metrics: [perf('9', D, '40000000', { campaign: { id: '9', name: 'Old Promo', advertisingChannelType: 'SEARCH' } })],
    });
    expect(d.campaigns!.find((c) => c.id === 'google-9')).toMatchObject({ name: 'Old Promo', stage: 'Ended' });
    expect(d.rows.paidSearch![179].spend).toBe(40);
  });

  it('days outside the window are dropped; the window ends on the account’s last complete day', () => {
    const d = normalizeGoogle({
      customer, campaigns: [camp('1', 'Brand')], now, days: 180,
      metrics: [perf('1', '2026-09-29', '999000000'), perf('1', '2025-01-01', '999000000')],
    });
    expect(d.rows.paidSearch!.reduce((a, r) => a + r.spend, 0)).toBe(0);
  });
});

describe('ad groups and ads', () => {
  const adKeys = (cid: string, gid: string, aid: string): Partial<GRow> =>
    ({ campaign: { id: cid }, adGroup: { id: gid }, adGroupAd: { ad: { id: aid } } });
  const input = {
    customer, now, days: 180,
    campaigns: [camp('1', 'Brand'), camp('2', 'PMax — All products', 'PERFORMANCE_MAX')],
    adGroups: [{ campaign: { id: '1' }, adGroup: { id: '11', name: 'Brand — Exact', status: 'ENABLED' } }],
    ads: [
      { campaign: { id: '1' }, adGroup: { id: '11' }, adGroupAd: {
        status: 'ENABLED', policySummary: { reviewStatus: 'REVIEWED', approvalStatus: 'APPROVED' },
        ad: { id: '111', type: 'RESPONSIVE_SEARCH_AD', responsiveSearchAd: {
          headlines: [{ text: 'Acme — Official Site' }, { text: 'Free trial' }],
          descriptions: [{ text: 'Real description from Google.' }],
        } } } },
      { campaign: { id: '1' }, adGroup: { id: '11' }, adGroupAd: {
        status: 'ENABLED', policySummary: { reviewStatus: 'REVIEW_IN_PROGRESS' },
        ad: { id: '112', type: 'RESPONSIVE_SEARCH_AD', responsiveSearchAd: { headlines: [{ text: 'New test' }] } } } },
    ] as GRow[],
    metrics: [
      perf('1', D, '30000000', adKeys('1', '11', '111')),
      conv('1', D, 'SUBMIT_LEAD_FORM', 2, undefined, adKeys('1', '11', '111')),
      perf('1', D, '10000000', adKeys('1', '11', '112')),
      /* Campaign-level rows for the same campaign -- must NOT be added on top of its ads. */
      perf('1', D, '40000000'),
      conv('1', D, 'SUBMIT_LEAD_FORM', 2),
      /* Performance Max: campaign-level only. */
      perf('2', D, '80000000'),
      conv('2', D, 'PURCHASE', 1, 120),
    ] as GRow[],
  };

  it('⭐ ads are the unit; the ad group and campaign are their sums -- counted once', () => {
    const d = normalizeGoogle(input);
    const brand = d.campaigns!.find((c) => c.id === 'google-1')!;
    expect(brand.rows[179]).toMatchObject({ spend: 40, leads: 2 });
    expect(brand.adSets).toHaveLength(1);
    expect(brand.adSets![0]).toMatchObject({ id: 'google-11', name: 'Brand — Exact' });
    expect(brand.adSets![0].rows[179].spend).toBe(40);
    expect(brand.ads!.map((a) => a.rows[179].spend)).toEqual([30, 10]);
  });

  it('the ad’s real copy: first headline and description; still in review reads as Review', () => {
    const brand = normalizeGoogle(input).campaigns!.find((c) => c.id === 'google-1')!;
    expect(brand.ads![0]).toMatchObject({
      id: 'google-111', adSetId: 'google-11', headline: 'Acme — Official Site',
      body: 'Real description from Google.', kind: 'text', stage: 'Active',
    });
    expect(brand.ads![1]).toMatchObject({ headline: 'New test', body: '', stage: 'Review' });
  });

  it('Performance Max has no ads -- its own numbers, and the ad tier stays unloaded (not "none")', () => {
    const pmax = normalizeGoogle(input).campaigns!.find((c) => c.id === 'google-2')!;
    expect(pmax.rows[179]).toMatchObject({ spend: 80, sales: 1, revenue: 120 });
    expect(pmax.ads).toBeUndefined();
    expect(pmax.adSets).toBeUndefined();
  });

  it('the channel equals the sum of its campaigns', () => {
    const d = normalizeGoogle(input);
    expect(d.rows.paidSearch![179].spend).toBe(120);
  });
});

describe('vocabulary', () => {
  it('stages', () => {
    expect(stageOfGoogleCampaign('ENABLED', 'SERVING')).toBe('Active');
    expect(stageOfGoogleCampaign('ENABLED', 'ENDED')).toBe('Ended');
    expect(stageOfGoogleCampaign('ENABLED', 'PENDING')).toBe('Draft');
    expect(stageOfGoogleCampaign('PAUSED')).toBe('Paused');
    expect(stageOfGoogleCampaign('REMOVED')).toBe('Ended');
    expect(stageOfGoogleAd('ENABLED', 'REVIEW_IN_PROGRESS')).toBe('Review');
    expect(stageOfGoogleAd('PAUSED')).toBe('Paused');
  });
  it('objectives and channels', () => {
    expect(objectiveOfGoogle('SHOPPING')).toBe('Sales');
    expect(objectiveOfGoogle('DISPLAY')).toBe('Awareness');
    expect(objectiveOfGoogle('SEARCH')).toBe('Conversions');
    expect(objectiveOfGoogle('PERFORMANCE_MAX')).toBe('Conversions');
    expect(channelOfGoogle('VIDEO')).toBe('youtube');
    expect(channelOfGoogle('DEMAND_GEN')).toBe('paidSearch');
  });
});

describe('accounts', () => {
  it('managers are listed out, clients in -- each remembering the manager it came through', () => {
    const list = accountsFrom([
      { root: '1000000001', rows: [
        { customerClient: { id: '1000000001', descriptiveName: 'Agency MCC', manager: true, status: 'ENABLED' } },
        { customerClient: { id: '2000000002', descriptiveName: 'Zeta Co', currencyCode: 'USD', manager: false, status: 'ENABLED' } },
        { customerClient: { id: '3000000003', descriptiveName: 'Closed Co', currencyCode: 'USD', manager: false, status: 'CANCELED' } },
      ] },
      { root: '2000000002', rows: [   // also directly accessible -- listed once
        { customerClient: { id: '2000000002', descriptiveName: 'Zeta Co', currencyCode: 'USD', manager: false, status: 'ENABLED' } },
      ] },
      { root: '4000000004', rows: [
        { customerClient: { id: '4000000004', descriptiveName: 'Alpha Inc', currencyCode: 'EUR', manager: false, status: 'ENABLED' } },
      ] },
    ]);
    expect(list).toEqual([
      { id: '4000000004', name: 'Alpha Inc', currency: 'EUR', loginCustomerId: '4000000004' },
      { id: '2000000002', name: 'Zeta Co', currency: 'USD', loginCustomerId: '1000000001' },
    ]);
  });
});

describe('errors', () => {
  const failure = (code: Record<string, string>, message: string) => ({ error: {
    code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED',
    details: [{ '@type': 'type.googleapis.com/google.ads.googleads.v25.errors.GoogleAdsFailure',
      errors: [{ errorCode: code, message }] }],
  } });

  it('a test-access developer token says what to do, not just what went wrong', () => {
    expect(googleErrorMessage(failure({ authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' },
      'The developer token is only approved for use with test accounts.'), 403)).toMatch(/test accounts only.*Basic access/);
  });
  it('searchStream wraps errors in an array too; unknown codes pass through as Google said them', () => {
    expect(googleErrorMessage([failure({ queryError: 'PROHIBITED_FIELD' }, 'Field is prohibited.')], 400)).toBe('Field is prohibited.');
    expect(googleErrorMessage(null, 500)).toBe('Google Ads returned 500');
  });
});
