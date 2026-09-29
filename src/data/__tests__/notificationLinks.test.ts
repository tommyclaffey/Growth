// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CAMPAIGNS } from '../campaigns';
import { setStage } from '../campaignStatus';
import { CHANGE_THRESHOLD, notifications } from '../notifications';
import { CHANNEL_KEYS, LAST_WEEK, delta, totals } from '../metrics';

afterEach(() => {
  setStage('c8', CAMPAIGNS.find((c) => c.id === 'c8')!.stage);
  localStorage.clear();
});

const all = () => notifications([...CHANNEL_KEYS]);

/**
 * 🚨 The feed was typed by hand and three of its six claims were false against
 * the data. These tests hold every sentence to the numbers.
 */
describe('notifications are computed, and true', () => {
  it('⭐ the Figma story is now in the data: Meta CAC +42%, Affiliates leads +31% WoW', () => {
    expect(delta('meta', 'CAC', LAST_WEEK)).toBe(42);
    expect(delta('affiliates', 'Leads', LAST_WEEK)).toBe(31);
    const meta = all().find((n) => n.id === 'cac:meta')!;
    expect(meta.message).toMatch(/^Meta CAC rose 42% week over week/);
    expect(meta.short).toBe('Meta CAC ↑ 42% WoW');
    expect(all().find((n) => n.id === 'leads:affiliates')!.message).toMatch(/^Affiliates leads rose 31%/);
  });

  it('…and the month did not move: every published 30-day figure still holds', () => {
    expect(Math.round(totals('meta', 30).cac * 100) / 100).toBe(35.94);
    expect(Math.round(totals('all', 30).spend)).toBe(160780);
  });

  it('every change alert states the SAME number delta() gives the KPI cards', () => {
    for (const n of all().filter((x) => x.change !== undefined)) {
      expect(n.change).toBe(delta(n.channel!, n.metric!, LAST_WEEK));
      expect(Math.abs(n.change!)).toBeGreaterThanOrEqual(CHANGE_THRESHOLD);
      expect(n.message).toContain(`${Math.abs(n.change!)}%`);
    }
  });

  it('a quiet channel raises nothing -- no alert below the threshold', () => {
    for (const ch of CHANNEL_KEYS) {
      const cac = Math.abs(delta(ch, 'CAC', LAST_WEEK));
      const leads = Math.abs(delta(ch, 'Leads', LAST_WEEK));
      const raised = all().some((n) => n.channel === ch && n.group === 'This week');
      expect(raised, ch).toBe(cac >= CHANGE_THRESHOLD || leads >= CHANGE_THRESHOLD);
    }
  });

  it('every alert links to its subject, and a channel alert to THAT channel', () => {
    for (const n of all()) {
      expect(n.target).toBeDefined();
      if (n.target.kind === 'channel') expect(n.target.id).toBe(n.channel);
      if (n.target.kind === 'campaign') {
        const c = CAMPAIGNS.find((x) => x.id === n.target.id)!;
        expect(c.channel).toBe(n.channel);
      }
    }
  });

  it('pacing is an ACCOUNT fact -- no channel has a target of its own', () => {
    const p = all().find((n) => n.kind === 'pacing');
    if (p) expect(p.target.kind).toBe('account');
  });

  it('a switched-off channel raises nothing', () => {
    expect(notifications(CHANNEL_KEYS.filter((c) => c !== 'meta')).some((n) => n.channel === 'meta'))
      .toBe(false);
  });

  it('approving a campaign in Review clears its alert -- it reads the live stage', () => {
    expect(all().some((n) => n.id === 'review:c8')).toBe(true);
    setStage('c8', 'Active');
    expect(all().some((n) => n.id === 'review:c8')).toBe(false);
  });

  it('ids are stable, so read-state survives a reload', () => {
    expect(all().map((n) => n.id)).toEqual(all().map((n) => n.id));
  });
});
