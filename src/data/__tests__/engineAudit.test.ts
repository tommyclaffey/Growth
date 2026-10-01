// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyStructure } from '../structure';
import { clearDecisionCache, decisions, heldBack, type Candidate } from '../decisions';
import { planFrom } from '../plan';
import { creativeById } from '../creative';
import { CAMPAIGNS } from '../campaigns';
import { hydrate, TOTAL_POINTS, type DayRow } from '../metrics';
import { setMonthlyBudget, monthlyBudget } from '../profile';
import { seededSource } from '../sources/seeded';
import type { SourceCampaign } from '../source';
import type { ChannelName } from '../../styles/tokens';

/**
 * The Oct 1 overnight audit, as tests. Each scenario is an account built to
 * have the shape that broke the engine; the invariants run on all of them.
 */
const BUDGET = monthlyBudget();
afterEach(() => {
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
  applyStructure(undefined);
  setMonthlyBudget(BUDGET);
  localStorage.clear();
  clearDecisionCache();
});

const row = (spend: number, leads: number): DayRow =>
  ({ spend, impressions: spend * 80, clicks: leads * 20, leads, sales: leads / 10, revenue: spend * 3 });
/** Daily rows: `base` everywhere, `last` for the final 7 days. Small wobble so nothing is perfectly flat. */
const days = (spend: number, cac: number, last?: { spend?: number; cac?: number }): DayRow[] =>
  Array.from({ length: TOTAL_POINTS }, (_, i) => {
    const inLast = i >= TOTAL_POINTS - 7 && last;
    const s = (inLast && last.spend) || spend;
    const c = (inLast && last.cac) || cac;
    const w = 1 + 0.03 * Math.sin(i * 1.7);
    return row(s * w, (s * w) / c);
  });
type Spec = { id: string; ch: ChannelName; stage?: string; rows: DayRow[] };
function load(specs: Spec[]) {
  const camps: SourceCampaign[] = specs.map((x) => ({ id: x.id, name: `Camp ${x.id}`, channel: x.ch, stage: (x.stage ?? 'Active') as SourceCampaign['stage'], objective: 'Conversions', rows: x.rows }));
  const rows: Partial<Record<ChannelName, DayRow[]>> = {};
  for (const c of camps) {
    const cur = rows[c.channel];
    rows[c.channel] = cur ? cur.map((r, i) => {
      const o = c.rows[i];
      return { spend: r.spend + o.spend, impressions: r.impressions + o.impressions, clicks: r.clicks + o.clicks, leads: r.leads + o.leads, sales: r.sales + o.sales, revenue: r.revenue + o.revenue };
    }) : c.rows.map((r) => ({ ...r }));
  }
  hydrate({ rows, periodEnd: '2026-09-28', currency: 'USD' });
  applyStructure(camps);
  clearDecisionCache();
}

const SCENARIOS: Record<string, () => void> = {
  'H1: one campaign got dearer, another led the leads': () => load([
    { id: 'a', ch: 'meta', rows: days(1000, 40, { cac: 58 }) },
    { id: 'b', ch: 'meta', rows: days(1000, 40, { spend: 1500, cac: 40 }) },
    { id: 'c', ch: 'tiktok', rows: days(800, 45) },
  ]),
  'H1b: spend fell, and the campaign beats its channel': () => load([
    { id: 'g', ch: 'meta', rows: days(1000, 30, { spend: 650 }) },
    { id: 'h', ch: 'meta', rows: days(1000, 60) },
    { id: 'c', ch: 'tiktok', rows: days(800, 45) },
  ]),
  'H2: over plan, the dearest campaign had a good week': () => { load([
    { id: 'x', ch: 'meta', rows: days(1100, 80, { spend: 1600, cac: 78 }) },
    { id: 'y', ch: 'tiktok', rows: days(600, 40) },
  ]); setMonthlyBudget(30_000); },
  'H3: a raise held at the margin': () => load([
    { id: 'c', ch: 'meta', rows: days(1000, 40) },
    { id: 'd', ch: 'meta', rows: days(1000, 60) },
    { id: 't', ch: 'tiktok', rows: days(400, 250) },
  ]),
  'M1: a campaign in Review, in line with its channel': () => load([
    { id: 'r', ch: 'meta', stage: 'Review', rows: days(1000, 40) },
    { id: 's', ch: 'meta', rows: days(1000, 40) },
  ]),
  'M2: spend down 40%, leads down 20%': () => load([
    { id: 'f', ch: 'meta', rows: days(1000, 40, { spend: 600, cac: 30 }) },
    { id: 'e', ch: 'meta', rows: days(1000, 45, { spend: 600, cac: 34 }) },
  ]),
};

const units = (c: Candidate): string[] => {
  if (!c.effect || (c.effect.spend === 0 && c.effect.leads === 0)) return [];
  if (c.kind === 'reallocate-within-channel') { const [, , f, t] = c.id.split(':'); return [`campaign:${f}`, `campaign:${t}`]; }
  if (c.target.kind === 'ad') return [`ad:${c.target.id}`];
  if (c.target.kind === 'campaign') return [`campaign:${c.target.id}`];
  if (c.target.kind === 'channel') return CAMPAIGNS.filter((x) => x.channel === c.target.id).map((x) => `campaign:${x.id}`);
  return [];
};

describe.each(Object.entries(SCENARIOS))('%s', (_name, setup) => {
  it('⭐ one move per budget -- no two shown money moves touch the same campaign or ad', () => {
    setup();
    for (const r of [7, 30]) {
      const seen = new Map<string, string>();
      for (const c of decisions(r as never, ['meta', 'tiktok'])) {
        for (const u of units(c)) {
          expect(seen.get(u), `${c.action} vs ${seen.get(u)}`).toBeUndefined();
          seen.set(u, c.action);
        }
      }
    }
  });

  it('the plan never counts the same money twice', () => {
    setup();
    const shown = decisions(30, ['meta', 'tiktok']);
    const p = planFrom(shown, 30, ['meta', 'tiktok']);
    const all = p.moves.flatMap(units);
    expect(new Set(all).size).toBe(all.length);
  });

  it('held never contradicts shown: no duplicate, nothing inside a campaign being ended', () => {
    setup();
    const shown = decisions(30, ['meta', 'tiktok']);
    const key = (c: Candidate) => `${c.action.split(' ')[0]}|${c.target.kind}|${c.target.id}`;
    const keys = new Set(shown.map(key));
    const ending = new Set(shown.filter((c) => /^End /.test(c.action)).map((c) => c.target.id));
    for (const h of heldBack(30, ['meta', 'tiktok'])) {
      expect(keys.has(key(h)), h.action).toBe(false);
      if (h.target.kind === 'ad') expect(ending.has(creativeById(h.target.id)?.campaignId ?? ''), h.action).toBe(false);
    }
  });

  it('every overlap names the move that already acts on the budget', () => {
    setup();
    for (const h of heldBack(30, ['meta', 'tiktok']).filter((x) => x.held?.reason === 'overlap')) {
      expect(h.held!.sentence).toMatch(/^Another move already acts on this budget: “.+”/);
    }
  });

  it('a "led it" claim is true of the campaign it names', () => {
    setup();
    for (const c of decisions(7, ['meta', 'tiktok'])) {
      const up = c.because.match(/led it: ([\d,]+) leads .* up from ([\d,]+)/);
      if (up) expect(Number(up[1].replace(/,/g, ''))).toBeGreaterThan(Number(up[2].replace(/,/g, '')));
    }
  });
});

describe('the specific failures', () => {
  it('H2: the over-plan cut never lands on a campaign another card raises', () => {
    SCENARIOS['H2: over plan, the dearest campaign had a good week']();
    const shown = decisions(30, ['meta', 'tiktok']);
    const raised = new Set(shown.filter((c) => /^Raise /.test(c.action)).map((c) => c.target.id));
    for (const c of shown.filter((x) => x.kind === 'pacing' && /^Cut /.test(x.action))) {
      expect(raised.has(c.target.id), c.action).toBe(false);
    }
  });

  it('H3: pacing never sends money to a campaign a Shift takes money from', () => {
    SCENARIOS['H3: a raise held at the margin']();
    const shown = decisions(30, ['meta', 'tiktok']);
    const sources = new Set(shown.filter((c) => c.kind === 'reallocate-within-channel').map((c) => c.target.id));
    for (const c of shown.filter((x) => x.kind === 'pacing' && /^Put /.test(x.action))) {
      expect(sources.has(c.target.id), c.action).toBe(false);
    }
  });

  it('M1: "Approve" is never held for chance -- it claims agreement, not a difference', () => {
    SCENARIOS['M1: a campaign in Review, in line with its channel']();
    const all = [...decisions(30, ['meta']), ...heldBack(30, ['meta'])];
    const approve = all.find((c) => /^Approve /.test(c.action));
    expect(approve).toBeDefined();
    expect(approve!.held?.reason).not.toBe('chance');
    expect(approve!.compare).toBeUndefined();
  });

  it('M2: a cheaper week is credited to a campaign whose COST fell, and says so', () => {
    SCENARIOS['M2: spend down 40%, leads down 20%']();
    for (const c of [...decisions(7, ['meta']), ...heldBack(7, ['meta'])].filter((x) => /led it/.test(x.because))) {
      expect(c.because).not.toMatch(/up from/);
      expect(c.because).toMatch(/a lead, down from \$/);
    }
  });

  it('L3: a window with no data is not "100% under plan"', () => {
    load([{ id: 'n', ch: 'meta', rows: Array.from({ length: TOTAL_POINTS }, (_, i) => (i < TOTAL_POINTS - 40 ? row(0, 0) : row(1000, 25))) }]);
    hydrate({ rows: { meta: Array.from({ length: TOTAL_POINTS }, () => row(0, 0)) }, periodEnd: '2026-09-28', currency: 'USD' });
    clearDecisionCache();
    expect(decisions(30, ['meta']).some((c) => c.kind === 'pacing')).toBe(false);
  });
});
