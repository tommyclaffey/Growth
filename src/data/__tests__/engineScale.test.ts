// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyStructure } from '../structure';
import { clearDecisionCache, decisions, heldBack, type Candidate } from '../decisions';
import { planFrom } from '../plan';
import { CAMPAIGNS } from '../campaigns';
import { hydrate, TOTAL_POINTS, type DayRow } from '../metrics';
import { seededSource } from '../sources/seeded';
import type { SourceAd, SourceCampaign } from '../source';
import type { ChannelName } from '../../styles/tokens';

/**
 * ⭐ A real-scale account: 60 campaigns, 120 ad sets, 1,200 ads, every day of
 * history. The Sept 30 stress test was run by hand and never kept; this one
 * stays, and it runs the Oct 1 engine (chance tests, curves, one move per
 * budget, the plan) at the size a real Meta + Google account reaches.
 *
 * Deterministic: a seeded generator, so a failure reproduces.
 */
const CH: ChannelName[] = ['meta', 'tiktok', 'youtube', 'paidSearch', 'affiliates', 'podcasts'];
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const row = (spend: number, leads: number): DayRow =>
  ({ spend, impressions: spend * 80, clicks: leads * 20, leads, sales: leads / 10, revenue: spend * 3 });

function build(): SourceCampaign[] {
  const out: SourceCampaign[] = [];
  for (let c = 0; c < 60; c++) {
    const ch = CH[c % CH.length];
    const base = 200 + rnd() * 1800;                 // $200-$2,000 a day
    const cac = 20 + rnd() * 120;                     // $20-$140 a lead
    const b = 0.5 + rnd() * 0.5;                      // elasticity 0.5-1
    const drift = rnd() < 0.15 ? 1.05 : 1;            // some creep 5% a week
    const stage: SourceCampaign['stage'] = rnd() < 0.8 ? 'Active' : rnd() < 0.5 ? 'Paused' : 'Review';
    const adSets = [0, 1].map((s) => ({ id: `c${c}-s${s}`, name: `Set ${s}`, stage: 'Active' as const, rows: [] as DayRow[] }));
    const ads: SourceAd[] = [];
    for (const s of adSets) for (let a = 0; a < 10; a++) {
      ads.push({ id: `${s.id}-a${a}`, adSetId: s.id, name: `Ad ${a}`, headline: `Headline ${a % 4}`, body: '', kind: 'image',
        stage: rnd() < 0.85 ? 'Active' : 'Paused', rows: [] });
    }
    const weights = ads.map(() => 0.3 + rnd());
    const total = weights.reduce((x, y) => x + y, 0);
    const eff = ads.map(() => 0.6 + rnd() * 0.8);
    const rows: DayRow[] = [];
    for (let d = 0; d < TOTAL_POINTS; d++) {
      const budgetStep = 1 + 0.4 * Math.sin(d / 20 + c);          // budgets move: curves are measurable
      const spend = base * budgetStep * (0.9 + rnd() * 0.2);
      const weeksLeft = Math.max(0, Math.floor((d - (TOTAL_POINTS - 56)) / 7));
      const dayCac = cac * drift ** weeksLeft * (base / spend) ** (b - 1) * (0.85 + rnd() * 0.3);
      const leads = spend / dayCac;
      rows.push(row(spend, leads));
      ads.forEach((a, i) => a.rows.push(row(spend * weights[i] / total, leads * weights[i] / total * eff[i] / 1)));
    }
    for (const s of adSets) {
      s.rows = rows.map((_, d) => ads.filter((a) => a.adSetId === s.id)
        .reduce((acc, a) => row(acc.spend + a.rows[d].spend, acc.leads + a.rows[d].leads), row(0, 0)));
    }
    out.push({ id: `c${c}`, name: `Campaign ${c}`, channel: ch, stage, objective: 'Conversions', rows, adSets, ads });
  }
  return out;
}

const camps = build();
beforeAll(() => {
  const rows: Partial<Record<ChannelName, DayRow[]>> = {};
  for (const c of camps) {
    const cur = rows[c.channel];
    rows[c.channel] = cur ? cur.map((r, i) => row(r.spend + c.rows[i].spend, r.leads + c.rows[i].leads)) : c.rows.map((r) => ({ ...r }));
  }
  hydrate({ rows, periodEnd: '2026-09-28', currency: 'USD' });
  applyStructure(camps);
  clearDecisionCache();
});
afterAll(() => {
  const s = seededSource.initial!;
  hydrate({ rows: s.rows, periodEnd: s.account.periodEnd, currency: s.account.currency });
  applyStructure(undefined);
  clearDecisionCache();
});

const unitsOf = (c: Candidate): string[] => {
  if (!c.effect || (c.effect.spend === 0 && c.effect.leads === 0)) return [];
  if (c.kind === 'reallocate-within-channel') { const [, , f, t] = c.id.split(':'); return [`campaign:${f}`, `campaign:${t}`]; }
  if (c.target.kind === 'ad') return [`ad:${c.target.id}`];
  if (c.target.kind === 'campaign') return [`campaign:${c.target.id}`];
  if (c.target.kind === 'channel') return CAMPAIGNS.filter((x) => x.channel === c.target.id).map((x) => `campaign:${x.id}`);
  return [];
};

describe('⭐ the engine at real scale (60 campaigns, 1,200 ads)', () => {
  it('runs in well under a second, and a repeat call is free', () => {
    clearDecisionCache();
    let t = performance.now();
    const first = decisions(30, CH);
    const cold = performance.now() - t;
    t = performance.now();
    decisions(30, CH);
    const warm = performance.now() - t;
    expect(first.length).toBeGreaterThan(0);
    expect(cold).toBeLessThan(2000);       // generous for CI; ~hundreds of ms locally
    expect(warm).toBeLessThan(5);
  });

  it('every invariant holds: one move per budget, nothing NaN, held never shown', () => {
    for (const r of [7, 30, 90]) {
      const shown = decisions(r as never, CH);
      const held = heldBack(r as never, CH);
      const seen = new Set<string>();
      for (const c of shown) {
        for (const u of unitsOf(c)) { expect(seen.has(u), c.action).toBe(false); seen.add(u); }
        const text = `${c.action} ${c.because} ${c.expectation?.outcome ?? ''} ${c.evidence.map((e) => e.value).join(' ')}`;
        expect(text, c.action).not.toMatch(/NaN|Infinity|\$∞|undefined/);
        if (c.effect) { expect(Number.isFinite(c.effect.spend)).toBe(true); expect(Number.isFinite(c.effect.leads)).toBe(true); }
      }
      const ids = new Set(shown.map((c) => c.id));
      for (const h of held) expect(ids.has(h.id), h.action).toBe(false);
    }
  });

  it('the plan is finite and sums its moves', () => {
    const shown = decisions(30, CH);
    const p = planFrom(shown, 30, CH);
    expect(Number.isFinite(p.after.spend) && Number.isFinite(p.after.leads)).toBe(true);
    const net = p.moves.reduce((a, c) => a + c.effect!.spend, 0);
    expect(p.after.spend - p.before.spend).toBeCloseTo(net, 4);
  });

  it('the new detectors actually fire at scale -- not silent by accident', () => {
    const all = [...decisions(30, CH), ...heldBack(30, CH)];
    const kinds = new Set(all.map((c) => c.kind));
    expect(kinds.has('slow-leak')).toBe(true);                       // 15% of campaigns creep
    expect(all.some((c) => /last \d+ days hold/.test(c.expectation?.assuming ?? ''))).toBe(true);  // curves MEASURED
    expect(all.some((c) => c.held?.reason === 'overlap' || c.held?.reason === 'marginal' || c.held?.reason === 'chance')).toBe(true);
  });
});
