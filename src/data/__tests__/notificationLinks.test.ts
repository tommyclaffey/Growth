import { describe, expect, it } from 'vitest';
import { ALERTS } from '../../screens/Notifications';
import { CAMPAIGNS } from '../campaigns';
import { CHANNEL_LABEL } from '../metrics';

describe('notification links', () => {
  it('points every link at a campaign that exists', () => {
    for (const a of ALERTS) {
      if (!a.campaignId) continue;
      expect(CAMPAIGNS.some((c) => c.id === a.campaignId), `${a.id} -> ${a.campaignId}`).toBe(true);
    }
  });

  it('never links an alert to a campaign on a DIFFERENT channel', () => {
    for (const a of ALERTS) {
      if (!a.campaignId) continue;
      const c = CAMPAIGNS.find((x) => x.id === a.campaignId)!;
      /* The row is labelled "Meta"; opening it must not land on a TikTok
         campaign. This is the assertion a hardcoded id cannot make for
         itself, and the one that would catch a copy-paste. */
      expect(CHANNEL_LABEL[c.channel], `${a.id} labelled ${a.channel}`).toBe(a.channel);
    }
  });

  it('leaves channel-level alerts unlinked rather than picking a campaign', () => {
    /* Pacing is spread across every campaign on the channel. Opening one would
       invent an attribution the alert does not make, and a row that looks
       activatable and lands somewhere arbitrary is worse than one that does
       nothing. */
    const pacing = ALERTS.find((a) => a.message.includes('pacing'))!;
    expect(pacing.campaignId).toBeUndefined();
  });

  it('links the majority of alerts — an unlinked feed would be the old dead end', () => {
    expect(ALERTS.filter((a) => a.campaignId).length).toBeGreaterThan(ALERTS.length / 2);
  });
});
