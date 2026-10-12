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
const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: 'c1', name: 'Advantage+ — Evergreen Signups', channel: 'meta', stage: 'Active',
    objective: 'Conversions', spend: 34120, leads: 998, roas: 5.1,
    adSets: [
      { id: 'c1a', name: 'Broad — US 25-54',        spend: 19840, leads: 604, stage: 'Active' },
      { id: 'c1b', name: 'Lookalike 1% — Funded', spend: 9860,  leads: 289, stage: 'Active' },
      { id: 'c1c', name: 'Retargeting — 30d',       spend: 4420,  leads: 105, stage: 'Paused' },
    ],
  },
  {
    id: 'c2', name: 'Tax Season — Prospecting', channel: 'meta', stage: 'Paused',
    objective: 'Traffic', spend: 27120, leads: 706, roas: 3.9,
    adSets: [
      { id: 'c2a', name: 'Interest — First-time filers',   spend: 15400, leads: 402, stage: 'Paused' },
      { id: 'c2b', name: 'Interest — Freelancers', spend: 11720, leads: 304, stage: 'Paused' },
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
    id: 'c4', name: '30-Day Money Challenge', channel: 'tiktok', stage: 'Draft',
    objective: 'Sales', spend: 9670, leads: 290, roas: 3.4,
    adSets: [{ id: 'c4a', name: 'Challenge — 30 day', spend: 9670, leads: 290, stage: 'Draft' }],
  },
  {
    id: 'c5', name: 'App Walkthrough Series', channel: 'youtube', stage: 'Active',
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
      { id: 'c6b', name: 'Comparison sites', spend: 7280,  leads: 180, stage: 'Active' },
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
  /* ⭐ Oct 12: a real account runs several campaigns per channel at once
     (Tommy: "Campaigns ran at one time"). These fourteen were added at their
     channel's average cost per lead, and the channel totals in metrics.ts grew
     by exactly their spend -- so every campaign above keeps its figures, and
     each channel's CAC and ROAS are unchanged. */
  {
    id: 'c10', name: 'Reels — Budget Hacks', channel: 'meta', stage: 'Active',
    objective: 'Conversions', spend: 18600, leads: 518, roas: 4.7,
    adSets: [
      { id: 'c10a', name: 'Reels — Broad 18-34', spend: 11200, leads: 312, stage: 'Active' },
      { id: 'c10b', name: 'Reels — Students',    spend: 7400,  leads: 206, stage: 'Active' },
    ],
  },
  {
    id: 'c11', name: 'Retargeting — Install to Signup', channel: 'meta', stage: 'Active',
    objective: 'Conversions', spend: 9800, leads: 273, roas: 4.9,
    adSets: [
      { id: 'c11a', name: 'Site visitors — 14d',       spend: 6100, leads: 170, stage: 'Active' },
      { id: 'c11b', name: 'App installs — no signup',  spend: 3700, leads: 103, stage: 'Active' },
    ],
  },
  {
    id: 'c12', name: 'Lead Gen — Free Budget Guide', channel: 'meta', stage: 'Active',
    objective: 'Traffic', spend: 7400, leads: 206, roas: 4.2,
    adSets: [
      { id: 'c12a', name: 'Instant form — Parents',   spend: 4300, leads: 120, stage: 'Active' },
      { id: 'c12b', name: 'Instant form — New grads', spend: 3100, leads: 86,  stage: 'Active' },
    ],
  },
  {
    id: 'c13', name: 'Payday Routine — UGC', channel: 'tiktok', stage: 'Active',
    objective: 'Conversions', spend: 12400, leads: 371, roas: 4.0,
    adSets: [
      { id: 'c13a', name: 'UGC — Creators 18-24', spend: 7600, leads: 228, stage: 'Active' },
      { id: 'c13b', name: 'UGC — Side hustlers',  spend: 4800, leads: 143, stage: 'Active' },
    ],
  },
  {
    id: 'c14', name: 'TopView — Launch Week', channel: 'tiktok', stage: 'Active',
    objective: 'Awareness', spend: 8200, leads: 246, roas: 3.6,
    adSets: [
      { id: 'c14a', name: 'TopView — Broad US',       spend: 5200, leads: 156, stage: 'Active' },
      { id: 'c14b', name: 'Brand takeover — Weekend', spend: 3000, leads: 90,  stage: 'Active' },
    ],
  },
  {
    id: 'c15', name: 'Shorts — 60-Second Budget', channel: 'youtube', stage: 'Active',
    objective: 'Conversions', spend: 9600, leads: 240, roas: 3.3,
    adSets: [
      { id: 'c15a', name: 'Shorts — Finance viewers', spend: 6000, leads: 150, stage: 'Active' },
      { id: 'c15b', name: 'Shorts — Lookalike',       spend: 3600, leads: 90,  stage: 'Active' },
    ],
  },
  {
    id: 'c16', name: 'Finance Creators — Integrations', channel: 'youtube', stage: 'Active',
    objective: 'Awareness', spend: 7800, leads: 195, roas: 3.0,
    adSets: [
      { id: 'c16a', name: 'In-feed — Personal finance', spend: 4700, leads: 117, stage: 'Active' },
      { id: 'c16b', name: 'Bumper — 6s',                spend: 3100, leads: 78,  stage: 'Active' },
    ],
  },
  {
    id: 'c17', name: 'Demand Gen — Retargeting', channel: 'youtube', stage: 'Paused',
    objective: 'Conversions', spend: 4400, leads: 110, roas: 3.2,
    adSets: [
      { id: 'c17a', name: 'Video viewers — 30d', spend: 2600, leads: 65, stage: 'Paused' },
      { id: 'c17b', name: 'Channel subscribers', spend: 1800, leads: 45, stage: 'Paused' },
    ],
  },
  {
    id: 'c18', name: 'Cashback Portals', channel: 'affiliates', stage: 'Active',
    objective: 'Sales', spend: 8900, leads: 242, roas: 5.0,
    adSets: [
      { id: 'c18a', name: 'Cashback — Top 3 portals', spend: 5600, leads: 152, stage: 'Active' },
      { id: 'c18b', name: 'Coupon sites',             spend: 3300, leads: 90,  stage: 'Active' },
    ],
  },
  {
    id: 'c19', name: 'Creator Referral Codes', channel: 'affiliates', stage: 'Active',
    objective: 'Sales', spend: 6100, leads: 166, roas: 5.4,
    adSets: [
      { id: 'c19a', name: 'Finance creators',   spend: 3800, leads: 103, stage: 'Active' },
      { id: 'c19b', name: 'Newsletter writers', spend: 2300, leads: 63,  stage: 'Active' },
    ],
  },
  {
    id: 'c20', name: 'Competitor Conquesting', channel: 'paidSearch', stage: 'Active',
    objective: 'Conversions', spend: 6800, leads: 79, roas: 3.3,
    adSets: [
      { id: 'c20a', name: 'Exact — competitor names', spend: 4100, leads: 48, stage: 'Active' },
      { id: 'c20b', name: 'Phrase — "vs" searches',   spend: 2700, leads: 31, stage: 'Active' },
    ],
  },
  {
    id: 'c21', name: 'Performance Max — App', channel: 'paidSearch', stage: 'Active',
    objective: 'Conversions', spend: 9200, leads: 107, roas: 3.5,
    adSets: [
      { id: 'c21a', name: 'Asset group — Budgeting', spend: 5400, leads: 63, stage: 'Active' },
      { id: 'c21b', name: 'Asset group — Savings',   spend: 3800, leads: 44, stage: 'Active' },
    ],
  },
  {
    id: 'c22', name: 'Host Reads — Q4', channel: 'podcasts', stage: 'Active',
    objective: 'Awareness', spend: 9800, leads: 76, roas: 2.2,
    adSets: [
      { id: 'c22a', name: 'Personal finance shows', spend: 6200, leads: 48, stage: 'Active' },
      { id: 'c22b', name: 'Comedy shows',           spend: 3600, leads: 28, stage: 'Active' },
    ],
  },
  {
    id: 'c23', name: 'Dynamic Insertion — Networks', channel: 'podcasts', stage: 'Active',
    objective: 'Conversions', spend: 6400, leads: 50, roas: 2.0,
    adSets: [
      { id: 'c23a', name: 'Spotify Audience Network', spend: 3800, leads: 30, stage: 'Active' },
      { id: 'c23b', name: 'iHeart network',           spend: 2600, leads: 20, stage: 'Active' },
    ],
  },
];

/**
 * The campaigns the product shows -- the seed's, or a real account's.
 *
 * ⭐ Phase 4 seam. A connected ad account brings its OWN campaigns; showing its
 * real numbers under the demo's campaign names would be a lie on every
 * campaign screen. `export let` is a live binding, so every module reading
 * CAMPAIGNS sees the current list. Set through `applyStructure()` only.
 */
export let CAMPAIGNS: Campaign[] = SEED_CAMPAIGNS;

/** Replace the list (a source's campaigns), or null to restore the seed. */
export function setCampaigns(list: Campaign[] | null): void {
  CAMPAIGNS = list ?? SEED_CAMPAIGNS;
}
