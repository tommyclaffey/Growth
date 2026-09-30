// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGoogle, buildMeta, DAYS, SPECIAL } from './fixtures';
import { normalizeMeta } from '../data/sources/metaNormalize';
import { normalizeGoogle } from '../data/sources/googleNormalize';
import {
  hydrate, totals, rowsFor, activeChannels, setWindowEnd, windowIndex, hasWindow, endBackFor, dataSpan,
  CHANNEL_KEYS, suppliedChannels, delta, type DayRow,
} from '../data/metrics';
import { applyStructure } from '../data/structure';
import { syncChannels } from '../data/channels';
import { CAMPAIGNS } from '../data/campaigns';
import { campaignRows } from '../data/campaignSeries';
import { adSetRows } from '../data/adSets';
import { creativeRows, creativesFor, rankCreatives } from '../data/creative';
import { rankedAds, RANK_METRICS } from '../data/adRanking';
import { decisions } from '../data/decisions';
import { notifications } from '../data/notifications';
import { brief } from '../data/brief';
import { ask } from '../data/assistant';
import { buildCsv } from '../data/exportCsv';
import type { SourceData } from '../data/source';

const T: Record<string, number[]> = {};
function time<X>(label: string, fn: () => X): X {
  const t0 = performance.now();
  const out = fn();
  (T[label] ??= []).push(performance.now() - t0);
  return out;
}
const BAD = /NaN|Infinity|undefined|\[object Object\]|null/;
function strings(x: unknown, out: string[] = []): string[] {
  if (typeof x === 'string') out.push(x);
  else if (Array.isArray(x)) x.forEach((v) => strings(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => strings(v, out));
  return out;
}
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const gc = () => (globalThis as { gc?: () => void }).gc?.();

function load(d: SourceData) {
  time('hydrate', () => hydrate({ rows: d.rows, periodEnd: d.account.periodEnd, currency: d.account.currency }));
  time('applyStructure', () => applyStructure(d.campaigns));
  syncChannels(false);
}

function renderPass(tag: string, range: number, campaignName: string, moveQ: string) {
  const out: Record<string, unknown> = {};
  time(`${tag} totals(all ch)`, () => { for (const c of [...activeChannels(), 'all' as const]) out[`t:${c}`] = totals(c, range); });
  time(`${tag} rankedAds x4 metrics x2 modes`, () => {
    for (const m of RANK_METRICS) for (const mode of ['relative', 'absolute'] as const) rankedAds(m, mode, range);
  });
  time(`${tag} rankCreatives(all campaigns, CAC)`, () => { for (const c of CAMPAIGNS) rankCreatives(creativesFor(c.id), 'CAC', range); });
  out.d = time(`${tag} decisions(${range})`, () => decisions(range));
  out.n = time(`${tag} notifications()`, () => notifications());
  out.b = time(`${tag} brief(${range})`, () => brief(range));
  const qs = ['What should I do next?', 'Where should more budget go?', 'Which channel has the worst ROAS?',
    `What's going on with ${campaignName}?`, moveQ];
  qs.forEach((q, i) => { out[`ask${i}`] = time(`${tag} ask#${i + 1}`, () => ask(q, range)); });
  out.csv = time(`${tag} buildCsv('all',90)`, () => buildCsv('all', 90));
  return out;
}

function checkStrings(where: string, x: unknown) {
  const bad = strings(x).filter((s) => BAD.test(s));
  if (bad.length) console.log(`BAD STRINGS in ${where}:`, bad.slice(0, 5));
  expect(bad, where).toEqual([]);
}

function reconcile(tag: string) {
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  const F: (keyof DayRow)[] = ['spend', 'impressions', 'clicks', 'leads', 'sales', 'revenue'];
  const sum = (lists: DayRow[][], n: number) => Array.from({ length: n }, (_, i) =>
    Object.fromEntries(F.map((f) => [f, lists.reduce((a, l) => a + l[i][f], 0)])) as unknown as DayRow);
  let fails = 0; let checked = 0;
  for (const c of CAMPAIGNS) {
    const cr = campaignRows(c.id, DAYS);
    expect(cr.length).toBe(DAYS);
    const ads = creativesFor(c.id);
    if (c.adSets.length === 0) continue;
    const setSums = sum(c.adSets.map((s) => adSetRows(s.id, DAYS)), DAYS);
    for (const s of c.adSets) {
      const mine = ads.filter((a) => a.adSetId === s.id).map((a) => creativeRows(a.id, DAYS));
      if (mine.length === 0) continue;
      const as = sum(mine, DAYS); const sr = adSetRows(s.id, DAYS);
      for (let i = 0; i < DAYS; i++) for (const f of F) { checked++; if (!near(as[i][f], sr[i][f])) fails++; }
    }
    for (let i = 0; i < DAYS; i++) for (const f of F) { checked++; if (!near(setSums[i][f], cr[i][f])) fails++; }
  }
  for (const ch of suppliedChannels()) {
    const chRows = rowsFor(ch, DAYS);
    const cs = sum(CAMPAIGNS.filter((c) => c.channel === ch).map((c) => campaignRows(c.id, DAYS)), DAYS);
    for (let i = 0; i < DAYS; i++) for (const f of F) { checked++; if (!near(cs[i][f], chRows[i][f])) fails++; }
  }
  console.log(`[${tag}] reconciliation: ${checked} cells checked, ${fails} mismatches`);
  expect(fails).toBe(0);
}

function runAccount<I>(tag: string, fixture: () => I, norm: (i: I) => SourceData, moveQ: string, pickName: (names: string[]) => string) {
  it(`${tag}: timings, correctness, memory`, () => {
    let input: I | null = time(`${tag} build fixture`, fixture);
    gc();
    const m0 = process.memoryUsage().heapUsed;
    const data = time(`${tag} normalize`, () => norm(input!));
    const rowsIn = (input as { insights?: unknown[]; metrics?: unknown[] }).insights?.length ?? (input as { metrics: unknown[] }).metrics.length;
    console.log(`[${tag}] input rows: ${rowsIn}`);
    input = null;
    gc();
    const m1 = process.memoryUsage().heapUsed;
    load(data);
    gc();
    const m2 = process.memoryUsage().heapUsed;
    console.log(`[${tag}] heap: with input ${mb(m0)}, after normalize (+input freed) ${mb(m1)}, after hydrate+structure ${mb(m2)}; delta hydrate+structure ${mb(m2 - m1)}`);
    console.log(`[${tag}] campaigns ${CAMPAIGNS.length}, adsets ${CAMPAIGNS.reduce((a, c) => a + c.adSets.length, 0)}, ads ${CAMPAIGNS.reduce((a, c) => a + creativesFor(c.id).length, 0)}, channels ${suppliedChannels().join(',')}`);

    const name = pickName(CAMPAIGNS.map((c) => c.name));
    const passes: Record<string, unknown>[] = [];
    for (let k = 0; k < 2; k++) {
      passes.push(renderPass(`${tag} r30`, 30, name, moveQ));
      passes.push(renderPass(`${tag} r365`, 365, name, moveQ));
    }

    /* ---- correctness: strings */
    for (const p of passes.slice(0, 2)) {
      for (const [k, v] of Object.entries(p)) {
        if (k.startsWith('t:')) {
          for (const n of Object.values(v as Record<string, number>)) expect(Number.isFinite(n), `${k}`).toBe(true);
        } else checkStrings(`${tag} ${k}`, v);
      }
    }
    for (const q of ['What should I do next?', `What's going on with ${name}?`]) {
      const a = passes[0][q === 'What should I do next?' ? 'ask0' : 'ask3'] as { text: string };
      console.log(`[${tag}] ASK "${q.slice(0, 60)}" ->\n   ${a.text.split('\n')[0].slice(0, 220)}`);
    }
    console.log(`[${tag}] ASK move ->`, (passes[0].ask4 as { text: string }).text.split('\n')[0].slice(0, 160));
    console.log(`[${tag}] decisions(30): ${(passes[0].d as unknown[]).length}, (365): ${(passes[1].d as unknown[]).length}; notifications ${(passes[0].n as unknown[]).length}`);

    /* ---- names survive */
    const allText = strings([passes[0], passes[1], CAMPAIGNS]).join('\n');
    for (const s of Object.values(SPECIAL)) {
      if (CAMPAIGNS.some((c) => c.name === s)) {
        const inOutputs = strings([passes[0].d, passes[1].d, passes[0].n]).some((x) => x.includes(s));
        console.log(`[${tag}] special name "${s.slice(0, 30)}" in CAMPAIGNS; appears in decisions/notifications text: ${inOutputs}`);
      }
    }
    expect(allText.length).toBeGreaterThan(0);

    /* ---- ids unique */
    const ids = (xs: string[]) => xs.length - new Set(xs).size;
    const cIds = CAMPAIGNS.map((c) => c.id);
    const sIds = CAMPAIGNS.flatMap((c) => c.adSets.map((s) => s.id));
    const aIds = CAMPAIGNS.flatMap((c) => creativesFor(c.id).map((a) => a.id));
    console.log(`[${tag}] duplicate ids: campaigns ${ids(cIds)}, adsets ${ids(sIds)}, ads ${ids(aIds)}, cross-tier ${ids([...cIds, ...sIds, ...aIds])}`);
    const decIds = (passes[1].d as { id: string }[]).map((d) => d.id);
    console.log(`[${tag}] duplicate decision ids: ${ids(decIds)}`);

    /* ---- tiers reconcile */
    reconcile(tag);

    /* ---- window model at the padding edge */
    const L = (xs: unknown[]) => xs.length;
    const c0 = CAMPAIGNS[0].id; const s0 = CAMPAIGNS.find((c) => c.adSets.length)!.adSets[0].id; const a0 = CAMPAIGNS.flatMap((c) => creativesFor(c.id))[0].id;
    const probe = (end: number, range: number, back = 0) => {
      setWindowEnd(end);
      const r = [L(rowsFor('all', range, back)), L(rowsFor(suppliedChannels()[0], range, back)), L(campaignRows(c0, range, back)), L(adSetRows(s0, range, back)), L(creativeRows(a0, range, back)), hasWindow(range, back)];
      setWindowEnd(0);
      return r.join('/');
    };
    console.log(`[${tag}] window [all/ch/campaign/adset/ad/hasWindow]: 365@0=${probe(0, 365)} 365@90=${probe(90, 365)} 365@91=${probe(91, 365)} 365 back1=${probe(0, 365, 1)} 90@365 back1=${probe(275, 90, 1)} 30@(455-30)=${probe(425, 30)} 30@426=${probe(426, 30)}`);
    console.log(`[${tag}] dataSpan ${dataSpan().join('..')}, endBackFor(first day, 1)=${endBackFor(dataSpan()[0], 1)}, endBackFor(day before,1)=${endBackFor('2025-06-29', 1)}; delta(all,Spend,365)=${delta('all', 'Spend', 365)}`);
  });
}

describe('real-scale stress', () => {
  runAccount('META', buildMeta, normalizeMeta, 'What if I move $5k from meta to paidSearch?',
    (names) => names.find((n) => n.includes('Lookalike 3%'))!);
  runAccount('GOOGLE', buildGoogle, normalizeGoogle, 'What if I move $5k from youtube to paidSearch?',
    (names) => names.find((n) => n.startsWith('SEARCH | Generic | Cluster 12'))!);

  it('report', () => {
    const rows = Object.entries(T).map(([k, v]) => `${k.padEnd(52)} ${v.map((x) => x.toFixed(1).padStart(8)).join(' ')}`);
    console.log(`TIMINGS (ms; each run):\n${rows.join('\n')}`);
    console.log(`CHANNEL_KEYS ${CHANNEL_KEYS.length}`);
  });
});
