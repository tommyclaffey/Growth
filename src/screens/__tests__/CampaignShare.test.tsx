// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CampaignDetail } from '../CampaignDetail';
import { adSetTotals } from '../../data/adSets';
import { CAMPAIGNS } from '../../data/campaigns';

afterEach(cleanup);

describe('🐛 the ad-set table’s Share follows the date range', () => {
  it('each share is the ranged ad-set spend over the ranged total', () => {
    const c = CAMPAIGNS.find((x) => x.adSets.length > 1)!;
    for (const range of [7, 90] as const) {
      cleanup();
      const { container } = render(<CampaignDetail id={c.id} range={range} metric="Spend" onBack={() => {}} backLabel="Campaigns" />);
      const total = c.adSets.reduce((a, s) => a + adSetTotals(s.id, range).spend, 0);
      const cells = [...container.querySelectorAll('.gr-cell--share')].map((td) => td.textContent);
      expect(cells).toEqual(c.adSets.map((s) => `${Math.round((adSetTotals(s.id, range).spend / total) * 100)}%`));
    }
  });
});
