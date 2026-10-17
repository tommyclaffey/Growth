import './AdInsights.css';
import { DeltaBadge } from '../DeltaBadge/DeltaBadge';
import { creativeTotals, creativesFor, type Creative } from '../../data/creative';
import { CHANNEL_METRICS } from '../../data/channelMetrics';
import { decisionsFor, heldBack, limitsFor, TIER_LABEL, type Candidate } from '../../data/decisions';
import { rateTest } from '../../data/evidence';
import { formatMetric, type Range } from '../../data/metrics';
import { CHANNEL_DEPTH } from '../../data/channelDepth';
import type { ChannelName } from '../../styles/tokens';

/**
 * ⭐ Oct 16: the two cards that fill the ad page's right column.
 *
 * The page showed the ad and its copy, and the copy card is short, so half the
 * first screen was empty (Tommy: "It feels like a big empty space"). Both cards
 * answer the next question the page raises, from numbers it already has:
 *   - Funnel: WHERE this ad wins or leaks, step by step, against its own ad set.
 *   - Growth's call: WHAT to do about it, from the same engine as Decisions.
 * Nothing here is new data. Both read the ad's own rows and its ad set's.
 */

type Totals = ReturnType<typeof creativeTotals>;

interface Step { key: 'impressions' | 'clicks' | 'leads' | 'sales'; label: string }

/** The steps this CHANNEL reports. Podcasts have no clicks; search has no impressions. */
function stepsFor(channel: ChannelName): Step[] {
  const m = CHANNEL_METRICS[channel];
  const steps: Step[] = [];
  if (m.includes('Impressions')) steps.push({ key: 'impressions', label: 'Impressions' });
  if (m.includes('Clicks')) steps.push({ key: 'clicks', label: 'Clicks' });
  steps.push({ key: 'leads', label: 'Leads' }, { key: 'sales', label: 'Sales' });
  return steps;
}

/** What the step-to-step rate is called, so it reads as the metric a marketer knows. */
function rateName(from: Step['key'], to: Step['key']): string {
  if (from === 'impressions' && to === 'clicks') return 'Click-through';
  if (from === 'clicks' && to === 'leads') return 'Lead rate';
  if (from === 'impressions' && to === 'leads') return 'Leads per impression';
  return 'Close rate';
}

const count = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (r: number) => `${(r * 100).toFixed(r < 0.01 ? 2 : 1)}%`;

function sum(list: Creative[], range: Range): Totals {
  const z = { spend: 0, impressions: 0, clicks: 0, leads: 0, sales: 0, revenue: 0 };
  for (const x of list) {
    const t = creativeTotals(x.id, range);
    z.spend += t.spend; z.impressions += t.impressions; z.clicks += t.clicks;
    z.leads += t.leads; z.sales += t.sales; z.revenue += t.revenue;
  }
  return { ...z, cac: z.leads > 0 ? z.spend / z.leads : 0, roas: z.spend > 0 ? z.revenue / z.spend : 0 };
}

export interface AdInsightsProps {
  creative: Creative;
  campaignId: string;
  channel: ChannelName;
  range: Range;
}

export function AdFunnel({ creative, campaignId, channel, range }: AdInsightsProps) {
  const t = creativeTotals(creative.id, range);
  const siblings = creativesFor(campaignId).filter((x) => x.adSetId === creative.adSetId && x.stage === 'Active');
  const set = sum(siblings.length ? siblings : [creative], range);
  const steps = stepsFor(channel);
  const groupName = CHANNEL_DEPTH[channel].group.one.toLowerCase();

  return (
    <section className="gr-card gr-adx" aria-labelledby="gr-adx-funnel">
      <header className="gr-card__header">
        <h3 id="gr-adx-funnel" className="gr-card__title gr-type-card-heading">Funnel</h3>
        <span className="gr-type-caption gr-adx__muted">vs. its {groupName}</span>
      </header>
      <ol className="gr-adx__flow">
        {steps.map((s, i) => {
          const prev = steps[i - 1];
          const rate = prev && t[prev.key] > 0 ? t[s.key] / t[prev.key] : null;
          const setRate = prev && set[prev.key] > 0 ? set[s.key] / set[prev.key] : null;
          /* Bar and tick on ONE scale, so the gap you see is the gap there is. */
          const scale = Math.max(rate ?? 0, setRate ?? 0) * 1.25 || 1;
          return (
            <li key={s.key} className="gr-adx__seg">
              {prev && rate !== null && (
                <div className="gr-adx__rate">
                  <span className="gr-type-caption gr-adx__muted">{rateName(prev.key, s.key)}</span>
                  <span className="gr-adx__rate-row">
                    <span className="gr-type-body-medium gr-adx__rate-val">{pct(rate)}</span>
                    {setRate ? <DeltaBadge percent={(rate / setRate - 1) * 100} variant="benchmark" /> : null}
                  </span>
                  <span className="gr-adx__bar" aria-hidden="true">
                    <span className="gr-adx__fill" style={{ width: `${(rate / scale) * 100}%` }} />
                    {setRate !== null && <span className="gr-adx__tick" style={{ left: `${(setRate / scale) * 100}%` }} />}
                  </span>
                  <span className="gr-type-caption gr-adx__muted">{groupName} {setRate !== null ? pct(setRate) : '—'}</span>
                </div>
              )}
              <div className="gr-adx__count">
                <span className="gr-type-caption gr-adx__muted">{s.label}</span>
                <span className="gr-type-section gr-adx__num">{count(t[s.key])}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="gr-type-caption gr-adx__muted gr-adx__legend">
        Each rate is this ad&rsquo;s; the tick on its bar is the {groupName} average.
      </p>
    </section>
  );
}

const tierName = (c: Candidate) => (c.tier === 1 ? 'Ready to act' : c.tier === 2 ? 'Needs a judgement call' : 'Worth investigating');

export function AdVerdict({ creative, campaignId, range }: AdInsightsProps) {
  const target = { kind: 'ad' as const, id: creative.id };
  const shown = decisionsFor(target, range);
  const held = heldBack(range).filter((c) => c.target.kind === 'ad' && c.target.id === creative.id);
  const move = shown[0];
  const waiting = !move ? held[0] : undefined;

  /* Nothing proposed: say why, with the same chance test the engine uses, so
     "do nothing" is argued rather than implied. */
  const t = creativeTotals(creative.id, range);
  const rest = creativesFor(campaignId).filter((x) => x.adSetId === creative.adSetId && x.id !== creative.id && x.stage === 'Active');
  const r = sum(rest, range);
  const test = t.leads > 0 && r.leads > 0 ? rateTest({ spend: t.spend, leads: t.leads }, { spend: r.spend, leads: r.leads }) : null;
  const gap = r.cac > 0 && t.cac > 0 ? (t.cac / r.cac - 1) * 100 : null;
  const limit = limitsFor('ad').at(-1);
  const sure = test && test.level !== 'low';
  const cacLine = gap === null ? '' : `Its cost per lead is ${formatMetric('CAC', t.cac)}, ${Math.abs(Math.round(gap))}% ${gap <= 0 ? 'below' : 'above'} the rest of its group (${formatMetric('CAC', r.cac)}).`;
  /* Thresholds are the engine's own (decisions.ts: scale-winner 1.4x its lead
     share, spend-return-mismatch 1.6x its spend share on $500+), so the card
     says why nothing is proposed in the engine's terms, not a vague "fine". */
  const verdict = gap === null
    ? { title: 'Keep it running', body: 'Not enough leads yet to compare it with the rest of its group.' }
    : sure && gap <= -10
      ? { title: 'Doing well, keep it running', body: `${cacLine} Growth raises an ad\u2019s budget once it brings in 1.4\u00d7 its share of the campaign\u2019s leads; this one isn\u2019t that far ahead yet.` }
      : sure && gap >= 10
        ? { title: 'Watch it', body: `${cacLine} Growth proposes a pause once an ad takes 1.6\u00d7 more of the spend than its share of leads, on $500+; this one isn\u2019t there yet.` }
        : { title: 'Keep it running', body: `${cacLine} That gap is too small to move money on.` };

  return (
    <section className="gr-card gr-adx" aria-labelledby="gr-adx-call">
      <header className="gr-card__header">
        <h3 id="gr-adx-call" className="gr-card__title gr-type-card-heading">Growth&rsquo;s call</h3>
        <span className="gr-type-caption gr-adx__muted">
          {move ? tierName(move) : waiting ? 'Found, waiting' : 'No move'}
        </span>
      </header>

      {move ? (
        <>
          <p className="gr-type-strip gr-adx__action">{move.action}</p>
          <p className="gr-type-body gr-adx__because">{move.because}</p>
          {move.confidence && (
            <p className={`gr-type-caption gr-adx__conf is-${move.confidence.level}`}>
              <strong>{move.confidence.level[0].toUpperCase() + move.confidence.level.slice(1)} confidence.</strong> {move.confidence.sentence}
            </p>
          )}
          {move.expectation && (
            <p className="gr-type-caption gr-adx__muted">Expect: {move.expectation.outcome}</p>
          )}
          <p className="gr-type-caption gr-adx__muted">{TIER_LABEL[move.tier]}</p>
        </>
      ) : waiting ? (
        <>
          <p className="gr-type-strip gr-adx__action">{waiting.action}</p>
          <p className="gr-type-body gr-adx__because">{waiting.held?.sentence}</p>
        </>
      ) : (
        <>
          <p className="gr-type-strip gr-adx__action">{verdict.title}</p>
          <p className="gr-type-body gr-adx__because">{verdict.body}</p>
          {test && (
            <p className={`gr-type-caption gr-adx__conf is-${test.level}`}>{test.sentence}</p>
          )}
        </>
      )}

      {limit && (
        <p className="gr-type-caption gr-adx__limit">
          <span className="gr-type-overline">What this data can&rsquo;t tell you</span>
          <span>{limit[0].toUpperCase() + limit.slice(1)}.</span>
        </p>
      )}
    </section>
  );
}
