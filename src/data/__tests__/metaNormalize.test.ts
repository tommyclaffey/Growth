import { describe, expect, it } from 'vitest';
import {
  dayList, lastCompleteDay, normalizeMeta, objectiveOfMeta, stageOfMeta, type MetaInsight,
} from '../sources/metaNormalize';

/* Shaped exactly like Graph API v21 insights (level=campaign, time_increment=1):
   numbers as strings, conversions inside `actions`. */
const insight = (id: string, date: string, extra: Partial<MetaInsight> = {}): MetaInsight => ({
  campaign_id: id, campaign_name: `Campaign ${id}`, date_start: date,
  spend: '100.50', impressions: '12000', clicks: '240',
  actions: [
    { action_type: 'link_click', value: '240' },
    { action_type: 'lead', value: '6' },
    { action_type: 'offsite_conversion.fb_pixel_lead', value: '6' },   // same leads, again
    { action_type: 'purchase', value: '2' },
  ],
  action_values: [{ action_type: 'purchase', value: '310.00' }],
  ...extra,
});

const base = {
  account: { name: 'Acme Ads', currency: 'USD', timezone_name: 'America/Detroit' },
  campaigns: [
    { id: '1', name: 'Spring Leads', objective: 'OUTCOME_LEADS', effective_status: 'ACTIVE' },
    { id: '2', name: 'Retargeting', objective: 'OUTCOME_SALES', effective_status: 'PAUSED' },
  ],
  now: new Date('2026-09-29T15:00:00Z'),     // 11am in Detroit
  days: 180,
};

describe('Meta → product rows', () => {
  it('"today" is yesterday IN THE ACCOUNT’S TIMEZONE -- its today is still partial', () => {
    expect(lastCompleteDay('America/Detroit', new Date('2026-09-29T15:00:00Z'))).toBe('2026-09-28');
    /* 02:00 UTC is still the 28th in Detroit, so the last complete day is the 27th. */
    expect(lastCompleteDay('America/Detroit', new Date('2026-09-29T02:00:00Z'))).toBe('2026-09-27');
    expect(lastCompleteDay('Asia/Tokyo', new Date('2026-09-29T20:00:00Z'))).toBe('2026-09-29');
  });

  it('strings become numbers; leads are NOT double-counted across overlapping action types', () => {
    const d = normalizeMeta({ ...base, insights: [insight('1', '2026-09-28')] });
    const last = d.campaigns![0].rows.at(-1)!;
    expect(last.spend).toBeCloseTo(100.5);
    expect(last.impressions).toBe(12000);
    expect(last.clicks).toBe(240);
    expect(last.leads).toBe(6);            // not 12
    expect(last.sales).toBe(2);
    expect(last.revenue).toBeCloseTo(310);
  });

  it('a full, zero-filled history ending on the last complete day', () => {
    const d = normalizeMeta({ ...base, insights: [insight('1', '2026-09-28')] });
    expect(d.account.periodEnd).toBe('2026-09-28');
    expect(d.rows.meta).toHaveLength(180);
    expect(d.campaigns![1].rows.every((r) => r.spend === 0)).toBe(true);   // paused, no delivery
    expect(dayList('2026-09-28', 3)).toEqual(['2026-09-26', '2026-09-27', '2026-09-28']);
  });

  it('the channel is the sum of its campaigns, by construction', () => {
    const d = normalizeMeta({ ...base, insights: [insight('1', '2026-09-28'), insight('2', '2026-09-28', { spend: '40' })] });
    expect(d.rows.meta!.at(-1)!.spend).toBeCloseTo(140.5);
  });

  it('stage, objective and currency come from Meta, mapped to the product’s words', () => {
    const d = normalizeMeta({ ...base, account: { ...base.account, currency: 'EUR' }, insights: [] });
    expect(d.campaigns!.map((c) => [c.name, c.stage, c.objective])).toEqual([
      ['Spring Leads', 'Active', 'Conversions'], ['Retargeting', 'Paused', 'Sales'],
    ]);
    expect(d.account.currency).toBe('EUR');
    expect(stageOfMeta('PENDING_REVIEW')).toBe('Review');
    expect(objectiveOfMeta('OUTCOME_AWARENESS')).toBe('Awareness');
  });

  it('a campaign deleted since it delivered keeps its numbers', () => {
    const d = normalizeMeta({ ...base, insights: [insight('9', '2026-09-20')] });
    const gone = d.campaigns!.find((c) => c.id === 'meta-9')!;
    expect(gone.stage).toBe('Ended');
    expect(gone.rows.reduce((a, r) => a + r.spend, 0)).toBeCloseTo(100.5);
  });

  it('rows outside the window are ignored, not mis-dated', () => {
    const d = normalizeMeta({ ...base, insights: [insight('1', '2025-01-01')] });
    expect(d.rows.meta!.every((r) => r.spend === 0)).toBe(true);
  });
});
