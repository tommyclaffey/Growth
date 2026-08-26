import type { ChannelName } from '../styles/tokens';
import type { Stage } from '../components/StatusPill/StatusPill';

export interface AdSet {
  id: string;
  name: string;
  spend: number;
  leads: number;
  stage: Stage;
}

export interface Campaign {
  id: string;
  name: string;
  channel: ChannelName;
  stage: Stage;
  objective: string;
  spend: number;
  leads: number;
  roas: number;
  adSets: AdSet[];
}

/**
 * Campaigns, each with its ad sets nested underneath.
 *
 * In the Figma prototype this hierarchy was faked with 8 variables —
 * stage_1..4 and open_1..4, prefixed per channel — because a prototype has no
 * way to hold a list. In code it is just an array with children, which is the
 * shape it always wanted to be. Worth saying plainly in the case study: the
 * prototype variables were a workaround for a missing data model, not a design.
 */
export const CAMPAIGNS: Campaign[] = [
  {
    id: 'c1', name: 'Advantage+ Shopping — Evergreen', channel: 'meta', stage: 'Active',
    objective: 'Conversions', spend: 34120, leads: 998, roas: 5.1,
    adSets: [
      { id: 'c1a', name: 'Broad — US 25-54',        spend: 19840, leads: 604, stage: 'Active' },
      { id: 'c1b', name: 'Lookalike 1% — Purchase', spend: 9860,  leads: 289, stage: 'Active' },
      { id: 'c1c', name: 'Retargeting — 30d',       spend: 4420,  leads: 105, stage: 'Paused' },
    ],
  },
  {
    id: 'c2', name: 'Back to School — Prospecting', channel: 'meta', stage: 'Paused',
    objective: 'Traffic', spend: 27120, leads: 706, roas: 3.9,
    adSets: [
      { id: 'c2a', name: 'Interest — Parents',   spend: 15400, leads: 402, stage: 'Paused' },
      { id: 'c2b', name: 'Interest — Educators', spend: 11720, leads: 304, stage: 'Paused' },
    ],
  },
  {
    id: 'c3', name: 'Creator Spark — Q3', channel: 'tiktok', stage: 'Active',
    objective: 'Conversions', spend: 18440, leads: 552, roas: 4.1,
    adSets: [
      { id: 'c3a', name: 'Spark Ads — Top 5 creators', spend: 12960, leads: 401, stage: 'Active' },
      { id: 'c3b', name: 'In-feed — Broad',            spend: 5480,  leads: 151, stage: 'Active' },
    ],
  },
  {
    id: 'c4', name: 'TikTok Shop — Bundle Drop', channel: 'tiktok', stage: 'Draft',
    objective: 'Sales', spend: 9670, leads: 290, roas: 3.4,
    adSets: [{ id: 'c4a', name: 'Bundle — Starter', spend: 9670, leads: 290, stage: 'Draft' }],
  },
  {
    id: 'c5', name: 'YouTube Demo Series', channel: 'youtube', stage: 'Active',
    objective: 'Awareness', spend: 22470, leads: 561, roas: 3.1,
    adSets: [
      { id: 'c5a', name: 'In-stream — Skippable',   spend: 14200, leads: 358, stage: 'Active' },
      { id: 'c5b', name: 'Shorts — 15s cutdowns',   spend: 8270,  leads: 203, stage: 'Review' },
    ],
  },
  {
    id: 'c6', name: 'Partner Network — Tier 1', channel: 'affiliates', stage: 'Active',
    objective: 'Sales', spend: 18320, leads: 498, roas: 5.2,
    adSets: [
      { id: 'c6a', name: 'Review sites',   spend: 11040, leads: 318, stage: 'Active' },
      { id: 'c6b', name: 'Coupon & deals', spend: 7280,  leads: 180, stage: 'Active' },
    ],
  },
  {
    id: 'c7', name: 'Branded Search Defense', channel: 'paidSearch', stage: 'Active',
    objective: 'Conversions', spend: 11200, leads: 148, roas: 4.8,
    adSets: [{ id: 'c7a', name: 'Exact — brand terms', spend: 11200, leads: 148, stage: 'Active' }],
  },
  {
    id: 'c8', name: 'Non-brand — High Intent', channel: 'paidSearch', stage: 'Review',
    objective: 'Conversions', spend: 7200, leads: 66, roas: 1.9,
    adSets: [
      { id: 'c8a', name: 'Phrase — category',  spend: 4300, leads: 41, stage: 'Review' },
      { id: 'c8b', name: 'Broad — competitor', spend: 2900, leads: 25, stage: 'Ended' },
    ],
  },
  {
    id: 'c9', name: 'Mid-roll Sponsorships', channel: 'podcasts', stage: 'Ended',
    objective: 'Awareness', spend: 12240, leads: 95, roas: 2.1,
    adSets: [{ id: 'c9a', name: 'Business & finance shows', spend: 12240, leads: 95, stage: 'Ended' }],
  },
];
