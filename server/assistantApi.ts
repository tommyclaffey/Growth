import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { readJson, send } from './http.js';
import { loadGoogle } from './googleAdsApi.js';
import { loadMeta } from './metaApi.js';
import type { Plugin, ViteDevServer } from 'vite';

type ChannelName = string;

/**
 * The assistant's model backend.
 *
 * This runs on the dev server, never in the browser, because it holds the API
 * key. Anything shipped to the client is public — a key in the bundle is a key
 * on the internet.
 *
 * THE ARCHITECTURE, AND THE WHOLE POINT:
 *
 * The model does not produce numbers. It chooses which function to call, the
 * dashboard's own data layer answers, and the model writes the sentence around
 * the value it was handed. `totals()`, `delta()` and `series()` are the exact
 * functions the charts render from, so the assistant and the screen cannot
 * disagree — there is only one source of truth and both read it.
 *
 * That is what makes the evidence block honest. The figures listed under an
 * answer are not the model's recollection of what it said; they are the tool
 * results, captured as the tools ran.
 */

/* Opus 5 is the default. This task — read four numbers, write a sentence — runs
   fine on `claude-haiku-4-5` at roughly a fifth of the cost. One-line swap. */
const MODEL = 'claude-opus-5';

const systemFor = (currency: string) => `You are the assistant inside Growth, a cross-channel marketing dashboard.
You are the team's thought partner: you help them decide how to grow, and you are
honest about what the numbers can and cannot tell them.

Answer questions about the dashboard's data by calling the tools. The tools read
the same data the charts render from.

RULES, IN ORDER OF IMPORTANCE:

1. Never state a number you did not get from a tool. If you need a figure, call
   a tool for it. Do not estimate, interpolate, or recall.

2. You can say WHAT changed and BY HOW MUCH. You cannot say WHY. This data has
   no attribution model, no campaign log, and no outside context. When asked
   why something moved, give the movement, then say plainly that the cause is
   not in this data. Do not speculate about seasonality, creative, or audience.

2a. RECOMMENDATIONS COME FROM get_decisions, NEVER FROM YOU. A decision is a
   causal claim, which rule 2 forbids you from making on your own. The engine
   behind get_decisions computed its findings from this data and classified each
   one; your job is to report them, not to add to them. If get_decisions returns
   nothing, say there is nothing this data supports acting on — that is a real
   answer, and inventing a plausible suggestion instead is the worst thing you
   can do in this panel.

2b. RESPECT THE TIER on every finding you report.
   confidence "provable" — arithmetic. State it as a recommendation.
   confidence "projection" — state it AND state its 'assuming' clause in the same
     breath. A projection whose assumption is left out reads as a promise.
   confidence "unanswerable" — a question this data CANNOT answer. Never turn it
     into advice, even softened. Report it as the open question it is and name
     'needsToAnswer'.

2c. NEVER WRITE "tier 1", "tier 2" or "tier 3" to the user. Those are internal
   labels and they collide with real campaign names — this account has one called
   "Partner Network — Tier 1", so "no findings for Partner Network — Tier 1" has
   two meanings and the reader cannot tell which. Say provable, or a projection,
   or that the data cannot answer it. Use the words.
   ⚠️ The most striking number available is usually an unanswerable one: an expensive channel
   on last-touch. Cutting it is exactly what the data cannot justify, because
   last touch always flatters whichever channel sits nearest the conversion.

2f. THE PANEL SHOWS THE DECISIONS AS CARDS. Every provable or projection finding
   from get_decisions (the top three not already taken) renders below your answer
   as a card with its action, its reason, and a button. So open with ONE short
   sentence naming the single strongest action, and do not list or re-describe
   the others -- the cards carry them. Spend the rest of your words only on what
   no card shows: a projection's 'assuming' clause, and any unanswerable question.
   Two or three short paragraphs at most. Say each action as the engine wrote it
   ("Pause …", "Raise …", "End …"). Never soften one into "look into", "find out
   why" or "investigate" -- the engine has already decided what to do.

2e. WHAT THE TEAM DECIDED GOES TO get_commitments. Questions about decisions
   already made -- what, who owns them, whether they worked, what is late --
   are answered from the queue, never from the data tools. A grade of "no new
   data" means the number has not moved since the decision: say that, never
   call it a success or a failure.

2d. WHAT-IF AND SCALING QUESTIONS GO TO project_budget. "Where should more budget
   go?", "what if I move $5k from A to B?", "how do I scale Affiliates?" -- call
   project_budget and report what it returns. Never compute a projection
   yourself. Every projection is conditional: say its assumptions (cost per lead
   holds as spend grows; last-touch flatters channels near the sale) in the same
   answer. If it marks a channel as held because its CAC just spiked, say so and
   do not recommend adding money there.

3. Cost comparisons are not attribution. If you rank channels by CAC or ROAS,
   say that it is a cost comparison — a channel can look expensive and still be
   doing the work that makes another channel convert.

4. You answer questions about this dashboard's data. That is the whole job.
   If a request is something else — write a poem, draft an email, explain a
   concept, general knowledge — do not attempt it, not even briefly or as a
   flourish. Say plainly that it is outside what this panel does, and name what
   you can do instead. A clear refusal is a good answer; a confident wrong
   answer is the worst thing you can produce here. Being useful outside your
   scope is still being outside your scope.

5. For comparisons to the wider market — industry benchmarks, typical CAC or
   ROAS, what "good" looks like — use web_search. Never answer these from your
   own knowledge: a half-remembered benchmark sitting next to a computed figure
   looks equally solid and is not. Search, cite the source and its date, and say
   plainly that the comparison set is a different business than this one, so it
   is a range and not a target. If the search finds nothing usable, say so.

6. Keep the two kinds of number separate in how you talk. Figures from the
   tools are this account's actuals. Anything from a search is outside context —
   name it as such in the sentence.

7. Plain text only. No markdown — no asterisks for bold, no headers, no
   bullets. This renders as plain text, so the characters show up literally.

8. BE BRIEF -- a hard limit, not a style note. At most FOUR short sentences and
   about 70 words. Lead with the single most important thing. Name at most
   THREE findings; if there are more, say how many more. Do NOT repeat figures
   the panel already lists under "Figures used" -- mention a number only when
   the sentence needs it. A reader should get the answer in one glance.

9. When someone asks what is going on with a metric, a channel, a campaign or an
   ad, answer in this order -- ONE sentence each: the key figure, the one thing
   the engine found about it, what this data cannot tell them about it. Always the third part — a
   limitation stated only when the news is bad reads as an excuse; stated every
   time, it is a property of the instrument.

LEVELS THIS DASHBOARD HAS: account, channel, campaign, ad set and ad — there are
screens for every one of them. If a tool returns nothing for a campaign or an ad,
that means no finding met a threshold, NOT that the product cannot see that level.
Never tell the user a tier does not exist.

METRICS THIS DASHBOARD HAS: spend, impressions, clicks, leads, sales, revenue,
and the derived CTR, CPC, CPM, CVR, CAC and ROAS. Not every channel reports every
one — a podcast ad has no click, affiliates report no impressions — so use
get_blended for any rate and say which channels it covers. Do NOT tell the user a
metric is unavailable without checking; the tools above are the authority on what
exists, and if a metric is in their enum, the product has it.

Currency is ${currency}. CAC is ${currency} per lead. ROAS is a multiple of spend.`;

interface Metrics {
  /* Not CHANNEL_KEYS: a channel the account has switched off is not part of
     this business, so the assistant must not rank it, name it, or offer it as
     a scope. */
  activeChannels: () => ChannelName[];
  CHANNEL_LABEL: Record<string, string>;
  totals: (scope: string, range: number) => Record<string, number>;
  delta: (scope: string, metric: string, range: number) => number;
  series: (scope: string, metric: string, range: number) => { label: string; value: number }[];
  formatMetric: (metric: string, value: number) => string;
  /** The account's currency, from the loaded source (Phase 3). */
  CURRENCY?: string;
  METRICS: string[];
  CHANNEL_KEYS: ChannelName[];
  setActiveChannels: (keys: ChannelName[]) => void;
  setWindowEnd: (endBack: number) => void;
  rangeLabel: (range: number) => string;
  hydrate: (d: { rows: unknown; periodEnd: string; currency: string }) => void;
}

/** The decision engine, loaded through Vite like the data layer. */
interface Decisions {
  decisions: (range: number, channels?: string[]) => DecisionCandidate[];
  decisionsFor: (
    target: { kind: string; id: string }, range: number, channels?: string[],
  ) => DecisionCandidate[];
}

/** What the reader was pointing at when they asked, if a control told us. */
interface Subject { kind: string; id: string; label: string }

interface CampaignRec { id: string; name: string; channel: string }

/**
 * Work the subject out from the question when the caller did not send one.
 *
 * ⚠️ DEFENSIVE DEPTH, not a duplicate of the client's resolver. The app always
 * resolves before posting now — but this endpoint answers whatever arrives, and
 * an unscoped request produced the worst output this panel can make: correct
 * findings about a different campaign, with that campaign's channel marks beside
 * them, under a heading saying "Figures used".
 *
 * ⭐ The model handled it well when it happened — it named the findings as being
 * about other things and refused to substitute them. But the EVIDENCE PANEL still
 * listed them, so the prose said "I am not using these" directly above a box
 * labelled with what was used. A surface contradicting its own sentence is the
 * defect this panel exists to avoid, and it should not depend on the caller
 * remembering to scope.
 *
 * Deliberately shallow — name matching only, most specific first. It cannot beat
 * an explicit subject and does not try to; it only stops "nothing sent" meaning
 * "the whole account".
 */
function inferSubject(
  question: string, campaigns: CampaignRec[], channelLabel: Record<string, string>,
): Subject | undefined {
  const q = question.toLowerCase();

  /* Longest full name wins -- real accounts share long prefixes. */
  const campaign = campaigns.filter((c) => q.includes(c.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (campaign) return { kind: 'campaign', id: campaign.id, label: campaign.name };

  for (const [key, label] of Object.entries(channelLabel)) {
    if (q.includes(label.toLowerCase()) || q.includes(key.toLowerCase())) {
      return { kind: 'channel', id: key, label };
    }
  }
  return undefined;
}
interface DecisionCandidate {
  id: string;
  scope: string[];
  tier: 1 | 2 | 3;
  action: string;
  because: string;
  evidence: { label: string; value: string }[];
  expectation?: { outcome: string; assuming?: string; checkOn: string };
  needs?: string;
  channel?: string;
}

/** Blended coverage, so the model can say which channels a rate excludes. */
/** Formatting for the derived vocabulary — percentages, and money to 2dp. */
interface ChannelMetrics {
  formatDerived: (m: string, v: number) => string;
  valueOf: (m: string, r: Record<string, number>) => number;
  betterHigher: (m: string) => boolean;
}

interface Scenario {
  whereToScale: (extra: number, range: number) => { options: { channel: string; cac: number; leads: number; hold?: string }[] };
  moveBudget: (amount: number, from: string, to: string, range: number) =>
    { lost: number; gained: number; net: number; hold?: string };
  scaleWithin: (ch: string, range: number) =>
    { options: { name: string; cac: number; spend: number; plusLeads: number }[]; hold?: string };
  defaultExtra: (range: number) => number;
  ASSUME_CAC_HOLDS: string;
  ASSUME_LAST_TOUCH: string;
}

/** The table's Week / Month view -- src/data/trend.ts. */
interface TrendMod {
  trendBy: (scope: string, metric: string, by: 'week' | 'month', days: number) => {
    by: string; days: number;
    points: { label: string; days: number; full: boolean; value: number | null; change: number | null }[];
  };
}

interface Blended {
  blendedTotal: (m: string, channels: string[], range: number) => number;
  blendedDelta: (m: string, channels: string[], range: number) => number;
  coverageFor: (m: string, channels: string[]) => string[];
  coverageNote: (m: string, channels: string[]) => string | null;
}

/** Captured as the tools run, so the UI can show what the answer was built from. */
interface Evidence { label: string; value: string; channel?: string }

/**
 * Web results, kept in their own list — deliberately NOT merged into evidence.
 *
 * Evidence is this account's actuals, computed from the dashboard's data. A
 * search result is somebody else's number about somebody else's business. They
 * are different kinds of claim, so they do not get to share a visual
 * treatment: rendering them in one list would make the weaker one borrow the
 * authority of the stronger, which is the exact failure this panel exists to
 * avoid.
 */
interface Source { title: string; url: string }

function buildTools(
  m: Metrics, d: Decisions, b: Blended, cm: ChannelMetrics, sc: Scenario, tr: TrendMod,
  range: number, evidence: Evidence[], subject?: Subject,
  findings?: DecisionCandidate[],
  commitments: unknown[] = [],
) {
  const scopeEnum = ['all', ...m.activeChannels()];
  /* 🐛 STALE, AND IT MADE THE PRODUCT LIE ABOUT ITSELF.

     This read ['Spend','Clicks','Leads','Sales','CAC','ROAS'] -- the six funnel
     metrics the app had when these tools were written. Impressions, CTR, CPC,
     CPM and CVR arrived with G-010 and nobody updated the enum, so asking the
     model about impressions produced: "This dashboard doesn't track impressions."

     ⚠️ The model was not hallucinating. It was TOLD that, by a tool surface that
     had drifted from the product. A tool schema is the app's self-description,
     and a stale one turns a correct model into a confidently wrong one. Derived
     from the real vocabulary now, so it cannot drift again. */
  const metricEnum = [...m.METRICS, 'Impressions', 'CTR', 'CPC', 'CPM', 'CVR'];
  const label = (s: string) => (s === 'all' ? 'All channels' : m.CHANNEL_LABEL[s] ?? s);

  /* 🐛 formatMetric only speaks the six funnel metrics. Handed CTR it fell
     through to the count formatter and rendered 0.81 as "1" -- so the evidence
     row read "Blended CTR = 1" directly under a sentence saying 0.81%. The panel
     contradicting its own answer is worse than either number alone, because the
     reader cannot tell which to believe and both look authoritative.

     One formatter per vocabulary, picked by which vocabulary the metric is in. */
  const fmt = (metric: string, v: number) =>
    (m.METRICS as string[]).includes(metric)
      ? m.formatMetric(metric, v)
      : cm.formatDerived(metric, v);

  const scopeProp = {
    type: 'string' as const,
    enum: scopeEnum,
    description: '"all" for the blended total, or a single channel key.',
  };
  const metricProp = {
    type: 'string' as const,
    enum: metricEnum,
    description: 'Which metric to read.',
  };

  return [
    betaTool({
      name: 'get_totals',
      description:
        'Totals for one scope over the selected range: spend, clicks, leads, sales, revenue, plus derived CAC (spend per lead) and ROAS (revenue over spend). Use this for any "how much / how many" question.',
      inputSchema: {
        type: 'object',
        properties: { scope: scopeProp },
        required: ['scope'],
        additionalProperties: false,
      },
      run: ({ scope }: { scope: string }) => {
        const t = m.totals(scope, range);
        evidence.push(
          { label: `${label(scope)} · Spend`, value: m.formatMetric('Spend', t.spend), channel: scope },
          { label: `${label(scope)} · Leads`, value: m.formatMetric('Leads', t.leads), channel: scope },
          { label: `${label(scope)} · CAC`, value: m.formatMetric('CAC', t.cac), channel: scope },
          { label: `${label(scope)} · ROAS`, value: m.formatMetric('ROAS', t.roas), channel: scope },
        );
        return JSON.stringify({ scope: label(scope), rangeDays: range, ...t });
      },
    }),

    betaTool({
      name: 'get_blended',
      description:
        'A single metric across the channels that can actually report it, with its coverage. '
        + 'Use for Impressions, CTR, CPC, CPM and CVR, which not every channel has — podcasts '
        + 'have no click, affiliates report no impressions. Returns the figure and which '
        + 'channels it was computed over.',
      inputSchema: {
        type: 'object',
        properties: { metric: metricProp },
        required: ['metric'],
        additionalProperties: false,
      },
      run: ({ metric }: { metric: string }) => {
        const channels = m.activeChannels();
        const value = b.blendedTotal(metric, channels, range);
        const covering = b.coverageFor(metric, channels);
        const note = b.coverageNote(metric, channels);
        evidence.push({ label: `Blended ${metric}`, value: fmt(metric, value), channel: 'all' });
        if (note) evidence.push({ label: `${metric} coverage`, value: note, channel: 'all' });
        return JSON.stringify({
          metric, value, rangeDays: range,
          computedOver: covering.map((c) => label(c)),
          excluded: channels.filter((c) => !covering.includes(c)).map((c) => label(c)),
        });
      },
    }),

    betaTool({
      name: 'get_decisions',
      description:
        'What the decision engine found — the SAME findings the Decisions screen shows, '
        + 'already computed and already classified. Call this for any question about what to '
        + 'do, what to cut, what to prioritise, or what this data cannot answer. '
        + 'Each finding carries a confidence: "provable" is arithmetic, "projection" has a '
        + 'stated assumption, "unanswerable" is a question this data CANNOT answer. '
        + 'Never invent a recommendation — report what this returns. '
        + 'If it comes back EMPTY, say plainly there are no findings for what was '
        + 'asked about. Do NOT substitute findings about something else — a '
        + 'correct finding presented as the answer to a different question is '
        + 'worse than saying there is nothing.',
      inputSchema: {
        type: 'object',
        properties: {
          channel: {
            type: 'string' as const,
            enum: scopeEnum,
            description: 'Optional. "all" for the whole account, or one channel to filter to.',
          },
        },
        required: [],
        additionalProperties: false,
      },
      run: ({ channel }: { channel?: string }) => {
        /* ⭐ The CLIENT'S findings when it sent them, because the client is the
           only place that can evaluate them correctly.

           Campaign status overrides, the active channel set, the budget and the
           taken list all live in localStorage, which this process cannot read —
           so recomputing here silently used the SEEDED state. Set a campaign
           Active in the UI and the client found a finding the server could not:
           prose saying "no findings on TikTok" directly above a TikTok finding
           with a button on it.

           Recomputation is the fallback for a caller that sends nothing, not the
           normal path. ⚠️ A subject still wins over the model's own filter there:
           a control knows what the reader pointed at, and the model cannot
           recover it from prose. */
        const found = findings
          ?? (subject
            ? d.decisionsFor(subject, range, m.activeChannels())
            : d.decisions(range, m.activeChannels()));
        /* Already filtered by the client -- taken decisions never arrive. */
        const mine = !channel || channel === 'all'
          ? found : found.filter((c) => c.channel === channel);
        for (const c of mine.slice(0, 3)) {
          /* 🐛 Prefixed with where the finding lives. Three ads produced three
             rows all labelled "Share of campaign leads" — 3%, 33%, 6% — with
             nothing saying which ad each belonged to. Same defect as two
             decisions reading as one sentence, now in the figures box. */
          const where = c.scope[c.scope.length - 1] ?? '';
          evidence.push(...c.evidence.slice(0, 2).map((e) => ({
            label: where ? `${where} · ${e.label}` : e.label,
            value: e.value,
            channel: c.channel,
          })));
        }
        /* 🐛 An empty array taught the model the wrong lesson. Asked about a
           campaign with no findings, it replied that "this dashboard reports at
           channel level, not campaign level" — false: there are campaign, ad-set
           and ad screens. It inferred the product's SHAPE from the absence of a
           result, because the other tools here are channel-scoped and nothing
           told it otherwise.

           Empty is a fact about the findings, not about what exists. Say so. */
        if (mine.length === 0) {
          return JSON.stringify({
            findings: [],
            note: subject
              ? `No findings for ${subject.label}. This is not a limit of the `
                + `product — it reports at account, channel, campaign, ad set and `
                + `ad level. It means nothing about ${subject.label} met a `
                + `threshold worth raising.`
              : 'No findings. Not a limit of the product — nothing met a threshold.',
          });
        }

        /* ⚠️ The confidence goes out as a WORD, never a number.
           
           🐛 "Tier 1" is also a campaign name in this account — "Partner Network
           — Tier 1" — so the model writing "no findings for Partner Network —
           Tier 1" produced a sentence with two readings: no findings for that
           campaign, or no TIER-1 findings for Partner Network. The product's own
           vocabulary collided with its data.
           
           ⭐ And it will collide again with real accounts. Ad tiers, partner
           tiers and budget tiers are all ordinary campaign names. The tier is an
           internal classification; the reader gets words, and a word cannot be
           mistaken for part of a name. The model cannot echo a number it is
           never given. */
        const WORD = { 1: 'provable', 2: 'projection', 3: 'unanswerable' } as const;
        return JSON.stringify(mine.map((c) => ({
          confidence: WORD[c.tier], action: c.action, because: c.because,
          expect: c.expectation?.outcome,
          assuming: c.expectation?.assuming,
          needsToAnswer: c.needs,
        })));
      },
    }),

    betaTool({
      name: 'get_commitments',
      description:
        'The team\'s decisions queue: what has been decided (newest first), who owns each, its due date, '
        + 'whether it is overdue, and how it has been graded so far (worked / missed / pending / no new data / needs the person to judge). '
        + 'Use for "what did we decide", "is it working", "what is overdue", "what does Jess own".',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      run: () => JSON.stringify({
        count: commitments.length,
        decisions: commitments.slice(0, 12),
        note: commitments.length === 0 ? 'Nothing decided yet.' : undefined,
      }),
    }),

    betaTool({
      name: 'project_budget',
      description:
        'What-if projections for growing or moving budget, computed from current cost per lead. '
        + 'mode "add": where an extra amount buys the most leads across channels (channels whose CAC just spiked are marked hold). '
        + 'mode "move": leads lost and gained moving an amount from one channel to another. '
        + 'mode "within": which running campaigns inside one channel to push. '
        + 'Always report the assumptions it returns.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['add', 'move', 'within'] },
          amount: { type: 'number', description: 'Money, in the account currency. Omit for a sensible default.' },
          from: { type: 'string', enum: m.activeChannels(), description: 'mode "move": the channel money comes out of.' },
          to: { type: 'string', enum: m.activeChannels(), description: 'mode "move": the channel it goes into.' },
          channel: { type: 'string', enum: m.activeChannels(), description: 'mode "within": the channel to grow.' },
        },
        required: ['mode'],
        additionalProperties: false,
      },
      run: ({ mode, amount, from, to, channel }: {
        mode: 'add' | 'move' | 'within'; amount?: number; from?: string; to?: string; channel?: string;
      }) => {
        const r = (n: number) => Math.round(n);
        const assumptions = [sc.ASSUME_CAC_HOLDS, sc.ASSUME_LAST_TOUCH];
        /* 🐛 Nothing was checked: "move" without `to` silently ran "add" (a
           different question), from === to returned "+0 leads", a negative
           amount projected negative leads, and an unknown channel threw.
           An error the model can read back beats an answer to the wrong question. */
        const live = m.activeChannels() as string[];
        const bad = (e: string) => JSON.stringify({ error: e });
        if (amount !== undefined && !(Number.isFinite(amount) && amount > 0)) return bad('amount must be a positive number.');
        if (mode === 'move') {
          if (!from || !to) return bad('mode "move" needs both from and to.');
          if (!live.includes(from) || !live.includes(to)) return bad('from and to must be channels this account runs.');
          if (from === to) return bad('from and to are the same channel -- nothing moves.');
        }
        if (mode === 'within' && (!channel || !live.includes(channel))) return bad('mode "within" needs a channel this account runs.');
        if (mode === 'move' && from && to) {
          const amt = amount ?? r(sc.defaultExtra(range) / 2);
          const x = sc.moveBudget(amt, from, to, range);
          evidence.push({ label: `Move ${m.formatMetric('Spend', amt)} ${label(from)} → ${label(to)}`, value: `${x.net >= 0 ? '+' : '−'}${Math.abs(r(x.net))} leads` });
          return JSON.stringify({ amount: amt, from: label(from), to: label(to), leadsLost: r(x.lost), leadsGained: r(x.gained), netLeads: r(x.net), hold: x.hold, rangeDays: range, assumptions });
        }
        if (mode === 'within' && channel) {
          const w = sc.scaleWithin(channel, range);
          for (const o of w.options.slice(0, 3)) evidence.push({ label: `${o.name} CAC`, value: m.formatMetric('CAC', o.cac), channel });
          return JSON.stringify({ channel: label(channel), hold: w.hold, campaigns: w.options.slice(0, 3).map((o) => ({ name: o.name, cac: o.cac, plus25PercentBudget: r(o.spend * 0.25), extraLeads: r(o.plusLeads) })), rangeDays: range, assumptions: [sc.ASSUME_CAC_HOLDS] });
        }
        const extra = amount ?? sc.defaultExtra(range);
        const s = sc.whereToScale(extra, range);
        for (const o of s.options) evidence.push({ label: `${label(o.channel)} CAC`, value: m.formatMetric('CAC', o.cac), channel: o.channel });
        return JSON.stringify({ extra, rangeDays: range, options: s.options.map((o) => ({ channel: label(o.channel), cac: o.cac, leads: r(o.leads), hold: o.hold })), assumptions });
      },
    }),

    betaTool({
      name: 'get_delta',
      description:
        'Percentage change for one metric — the selected range against the same number of days immediately before it. Positive means the metric rose. Rising is not automatically good: a rising CAC is worse, a rising ROAS is better.',
      inputSchema: {
        type: 'object',
        properties: { scope: scopeProp, metric: metricProp },
        required: ['scope', 'metric'],
        additionalProperties: false,
      },
      run: ({ scope, metric }: { scope: string; metric: string }) => {
        /* 🐛 m.delta only speaks the six FUNNEL metrics. Asked for Impressions it
           returned NaN, the tool reported "NaN%", and that string reached the
           evidence panel -- a figure the product cannot show, shown. The model
           handled it well ("not computable for this metric") which is exactly
           what made it easy to miss: a graceful answer over a broken number.

           The derived metrics ARE computable, through the same blended path the
           cards use. Routed there instead. */
        const funnel = (m.METRICS as string[]).includes(metric);
        const d = funnel
          ? m.delta(scope, metric, range)
          : b.blendedDelta(metric, scope === 'all' ? m.activeChannels() : [scope], range);

        /* ⚠️ And never push a non-finite value regardless. A guard on the symptom
           as well as the cause, because the next metric added will find this
           path before anyone re-reads this comment. */
        if (!Number.isFinite(d)) {
          return JSON.stringify({
            scope: label(scope), metric, rangeDays: range,
            percentChange: null,
            note: 'Not computable for this metric over this scope.',
          });
        }

        evidence.push({
          label: `${label(scope)} · ${metric} change`,
          value: `${d > 0 ? '+' : ''}${d}%`,
          channel: scope,
        });
        return JSON.stringify({ scope: label(scope), metric, percentChange: d, rangeDays: range });
      },
    }),

    betaTool({
      name: 'rank_channels',
      description:
        'Every channel ranked by one metric, best first. "Best" accounts for direction — lowest CAC wins, highest ROAS wins. Use this for "which channel is best/worst", "what should I cut", or any comparison across channels.',
      inputSchema: {
        type: 'object',
        properties: { metric: metricProp },
        required: ['metric'],
        additionalProperties: false,
      },
      run: ({ metric }: { metric: string }) => {
        /* 🐛 This read `t[metric.toLowerCase()]` -- and totals() has no `ctr`,
           `cpc`, `cpm` or `cvr`, so every channel ranked 0 on those and "0" went
           into the evidence panel. It also ranked CPC and CPM highest-first.
           Now: the same valueOf the cards use, the same direction rule, and a
           channel that cannot report the metric (no leads for a CAC, no clicks
           for a CPC) is listed as unreportable, LAST -- never as a winning 0. */
        const denom: Record<string, string> = {
          CAC: 'leads', ROAS: 'spend', CTR: 'impressions', CPM: 'impressions', CPC: 'clicks', CVR: 'clicks',
        };
        const list = m.activeChannels().map((c) => {
          const t = m.totals(c, range);
          const ok = !denom[metric] || (t[denom[metric]] ?? 0) > 0;
          const value = ok ? cm.valueOf(metric, t) : null;
          return { channel: m.CHANNEL_LABEL[c] ?? c, key: c, value, formatted: value === null ? '—' : fmt(metric, value) };
        });
        const up = cm.betterHigher(metric);
        list.sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : up ? b.value - a.value : a.value - b.value));
        list.forEach((r) => evidence.push({ label: `${r.channel} · ${metric}`, value: r.formatted, channel: r.key }));
        return JSON.stringify({
          metric, rangeDays: range,
          bestFirst: list.map(({ channel, value, formatted }) => ({ channel, value, formatted })),
          note: list.some((r) => r.value === null) ? 'Channels with value null cannot report this metric (nothing to divide by) -- say so, do not rank them.' : undefined,
        });
      },
    }),

    betaTool({
      name: 'get_by_period',
      description:
        'One metric week by week or month by month -- the same numbers the dashboard table shows in its Week / Month view. '
        + 'Use for "how is X trending", "last 12 weeks", "month over month". Each period has its value (null when it cannot be reported) '
        + 'and its change against the period before (null when either period is partial -- a short period is not a worse one). '
        + 'State what moved; never claim why.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: scopeProp,
          metric: metricProp,
          by: { type: 'string', enum: ['week', 'month'] },
          periods: { type: 'integer', minimum: 1, maximum: 52, description: 'How many weeks or months back. Omit for the selected range.' },
        },
        required: ['scope', 'metric', 'by'],
        additionalProperties: false,
      },
      run: ({ scope, metric, by, periods }: { scope: string; metric: string; by: 'week' | 'month'; periods?: number }) => {
        if (scope !== 'all' && !(m.activeChannels() as string[]).includes(scope)) return JSON.stringify({ error: 'Unknown channel for this account.' });
        const n = Number.isInteger(periods) && periods! >= 1 && periods! <= 52 ? periods! : 0;
        const days = n ? (by === 'month' ? n * 31 : n * 7) : range;
        const t = tr.trendBy(scope, metric, by, days);
        const latest = t.points[t.points.length - 1];
        if (latest) {
          evidence.push({ label: `${label(scope)} · ${metric} · ${latest.label}`, value: latest.value === null ? '—' : fmt(metric, latest.value), channel: scope });
        }
        return JSON.stringify({
          scope: label(scope), metric, by, days: t.days,
          points: t.points.map((p) => ({ ...p, formatted: p.value === null ? null : fmt(metric, p.value) })),
        });
      },
    }),

    betaTool({
      name: 'get_series',
      description:
        'The day-by-day values behind a metric. Use only when the shape over time matters — a spike, a trend, a specific day. For a single figure use get_totals; this returns a lot of points. Funnel metrics only (Spend, Clicks, Leads, Sales, CAC, ROAS).',
      inputSchema: {
        type: 'object',
        /* 🐛 The shared enum offered Impressions/CTR/CPC/CPM/CVR, which series()
           has no case for: every value undefined, peak = s[-1], and the tool
           threw. Offered only what it can answer. */
        properties: { scope: scopeProp, metric: { ...metricProp, enum: [...m.METRICS] } },
        required: ['scope', 'metric'],
        additionalProperties: false,
      },
      run: ({ scope, metric }: { scope: string; metric: string }) => {
        const s = m.series(scope, metric, range).filter((d) => Number.isFinite(d.value));
        if (!s.length) return JSON.stringify({ scope: label(scope), metric, points: [], note: 'No daily values for this metric.' });
        const values = s.map((d) => d.value);
        const peak = s[values.indexOf(Math.max(...values))];
        const low = s[values.indexOf(Math.min(...values))];
        evidence.push(
          { label: `${label(scope)} · ${metric} peak`, value: `${m.formatMetric(metric, peak.value)} (${peak.label})`, channel: scope },
          { label: `${label(scope)} · ${metric} low`, value: `${m.formatMetric(metric, low.value)} (${low.label})`, channel: scope },
        );
        return JSON.stringify({ scope: label(scope), metric, points: s });
      },
    }),
  ];
}

/* ------------------------------------------------------------ context */

const SOURCE_TTL = 10 * 60 * 1000;
const sourceCache = new Map<string, { at: number; data: SourceShape }>();
interface SourceShape { account: { periodEnd: string; currency: string }; rows: unknown; campaigns?: unknown[] }

/**
 * Make the server's copy of the data layer match the browser that asked.
 *
 * ⚠️ The SSR module graph is ONE shared copy. Two people asking at the same
 * instant from different accounts would race -- acceptable for a single-user
 * dev server, and the reason this is not how a deployed backend should work.
 */
async function applyContext(server: ViteDevServer, m: Metrics, raw: unknown) {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const structure = (await server.ssrLoadModule('/src/data/structure.ts')) as unknown as { applyStructure: (x: unknown) => void };

  /* 1. The account. Real sources are fetched with the server's own tokens
        (never sent from the browser), cached briefly -- 180 days of an ad
        account is several API calls, and a follow-up question should not
        repeat them. */
  const source = c.source === 'meta' || c.source === 'google' ? c.source : 'seeded';
  let data: SourceShape;
  if (source === 'seeded') {
    const { seededSource } = (await server.ssrLoadModule('/src/data/sources/seeded.ts')) as unknown as { seededSource: { initial: SourceShape } };
    data = seededSource.initial;
  } else {
    const hit = sourceCache.get(source);
    if (hit && Date.now() - hit.at < SOURCE_TTL) data = hit.data;
    else {
      data = (source === 'meta' ? await loadMeta(server) : await loadGoogle(server)) as SourceShape;
      sourceCache.set(source, { at: Date.now(), data });
    }
  }
  m.hydrate({ rows: data.rows, periodEnd: data.account.periodEnd, currency: data.account.currency });
  structure.applyStructure(data.campaigns);

  /* 1b. Which days: custom dates end this many days before the last day of
        data. After hydrate, so it indexes the account that is loaded. */
  m.setWindowEnd(typeof c.windowEnd === 'number' && Number.isFinite(c.windowEnd) ? c.windowEnd : 0);

  /* 2. Which channels this business runs. */
  if (Array.isArray(c.channels)) {
    m.setActiveChannels(m.CHANNEL_KEYS.filter((k) => (c.channels as unknown[]).includes(k)));
  } else {
    m.setActiveChannels([...m.CHANNEL_KEYS]);
  }

  /* 3. The threshold every rule shares, and the budgets pacing reads. */
  const prefs = (await server.ssrLoadModule('/src/data/prefs.ts')) as unknown as { adoptPrefs: (p: { changeThreshold?: number }) => void };
  prefs.adoptPrefs({ changeThreshold: typeof c.threshold === 'number' ? c.threshold : 15 });
  const profile = (await server.ssrLoadModule('/src/data/profile.ts')) as unknown as { adoptBudgets: (b: unknown) => void };
  profile.adoptBudgets({ monthly: c.monthlyBudget, channels: c.channelBudgets });
}

/**
 * Adds POST /api/assistant to the dev server.
 *
 * Deliberately dev-only. The moment this is deployed publicly, every stranger
 * who finds the URL is spending real money on the key behind it — so making it
 * public should be an explicit decision, not something that happens by
 * forgetting to think about it.
 */
export function assistantApi(): Plugin {
  return {
    name: 'growth-assistant-api',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/assistant', async (req, res) => {
        const key = process.env.ANTHROPIC_API_KEY;

        /* A capability probe. The UI states in its footer whether a model is
           answering, and that claim has to be checked rather than assumed —
           it was previously derived from the last answer, so before the first
           question the panel confidently said there was no model when there
           was. Costs nothing: it never reaches the API. */
        if (req.method === 'GET') return send(res, 200, { available: Boolean(key), model: MODEL });

        if (req.method !== 'POST') return send(res, 405, { error: 'GET or POST only' });
        if (!key) {
          return send(res, 503, {
            error: 'no_key',
            message:
              'No ANTHROPIC_API_KEY. Put it in .env.local at the project root and restart the dev server.',
          });
        }

        try {
          /* 🐛 This read the body and called question.trim() OUTSIDE the try:
             {"question": 1} threw, the rejection went unhandled, and the whole
             dev server exited. Everything is inside the try now, and every
             field is checked before use. Sizes are capped because every byte
             here is re-sent to a paid model on every tool round. */
          const body = await readJson(req, 300_000);
          const question = typeof body.question === 'string' ? body.question.trim() : '';
          if (!question) return send(res, 400, { error: 'Question required.' });
          if (question.length > 2000) return send(res, 413, { error: 'Question too long (2,000 characters max).' });
          /* Any whole number of days 1-365 (two years of history), anything
             else falls back to 30 rather than reaching the metric functions
             unchecked. */
          const asked = Number(body.range);
          const range = Number.isInteger(asked) && asked >= 1 && asked <= 365 ? asked : 30;
          const rawSubject = body.subject as Partial<Subject> | undefined;
          const subject = rawSubject && typeof rawSubject.kind === 'string' && typeof rawSubject.id === 'string'
            ? { kind: rawSubject.kind, id: rawSubject.id, label: String(rawSubject.label ?? rawSubject.id).slice(0, 200) }
            : undefined;
          const findings = Array.isArray(body.findings) ? (body.findings as DecisionCandidate[]).slice(0, 40) : undefined;
          const commitments = Array.isArray(body.commitments) ? body.commitments.slice(0, 50) : [];

          /* Load the dashboard's own data layer through Vite so the tools call
             the exact functions the charts call — one source of truth. */
          const m = (await server.ssrLoadModule('/src/data/metrics.ts')) as unknown as Metrics;
          /* The same engine the Decisions screen and the local agent read. Three
             surfaces, one source of judgement -- a second one on the model path
             could disagree with the other two and nobody could tell which to
             believe. */
          const d = (await server.ssrLoadModule('/src/data/decisions.ts')) as unknown as Decisions;
          const b = (await server.ssrLoadModule('/src/data/blended.ts')) as unknown as Blended;
          const cm = (await server.ssrLoadModule('/src/data/channelMetrics.ts')) as unknown as ChannelMetrics;
          const sc = (await server.ssrLoadModule('/src/data/scenario.ts')) as unknown as Scenario;
          const tr = (await server.ssrLoadModule('/src/data/trend.ts')) as unknown as TrendMod;

          /* ⭐ The browser's account and settings, applied to the server's copy
             of the data layer before any tool runs -- so the model and the
             screens answer from the same numbers. */
          await applyContext(server, m, body.context);

          /* Pure data, no React — safe to load here. Read AFTER the context, so
             a real account's campaigns are the ones names are matched against. */
          const { CAMPAIGNS } = (await server.ssrLoadModule('/src/data/campaigns.ts')) as
            unknown as { CAMPAIGNS: CampaignRec[] };

          const evidence: Evidence[] = [];
          const client = new Anthropic({ apiKey: key });

          const runner = client.beta.messages.toolRunner({
            model: MODEL,
            /* A hard ceiling on tool rounds. The SDK has no default, so a model
               that kept calling tools would keep spending. Six covers every real
               question (the longest seen used four). */
            max_iterations: 6,
            max_tokens: 4000,
            output_config: { effort: 'low' },
            /* Which days, in words -- with custom dates the reader is not
               looking at "the last 30 days", and every figure must say so. */
            system: `${systemFor(m.CURRENCY ?? 'USD')}\n\nThe reader is looking at: ${m.rangeLabel(range)} (${range} days). `
              + 'When you state a figure, it is for these days -- name them the way they are named here.',
            tools: [
              ...buildTools(
                m, d, b, cm, sc, tr, range, evidence,
                /* What the caller said, or failing that what the question names. */
                subject ?? inferSubject(question, CAMPAIGNS, m.CHANNEL_LABEL),
                findings,
                commitments,
              ),
              /* Server-side: runs on Anthropic's infrastructure, so there is no
                 run() to write and no search account to hold. Capped at 3 so a
                 benchmark question cannot turn into an open-ended crawl. */
              { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
            ],
            messages: [{ role: 'user', content: question }],
          });

          /* The runner does not auto-resume a paused turn, and a server-side
             search is the thing most likely to cause one. Left unhandled it
             returns a silently truncated answer with no error — resume it. */
          let final!: Anthropic.Beta.BetaMessage;
          let resumes = 0;
          for await (const message of runner) {
            final = message;
            if (message.stop_reason === 'pause_turn' && resumes < 4) {
              resumes += 1;
              runner.pushMessages({ role: 'assistant', content: message.content });
            }
          }

          const text = final.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();

          /* List what was CITED, not everything that was searched.
             A search returns eight pages; the answer leans on two. Printing all
             eight implies a breadth of sourcing that did not happen, and buries
             the two that matter. Citations are attached to the text the model
             actually wrote, so read those first and fall back to raw results
             only when nothing was cited. */
          const sources: Source[] = [];
          const push = (url?: string, title?: string) => {
            if (!url || sources.some((s2) => s2.url === url)) return;
            sources.push({ title: title || url, url });
          };

          for (const block of final.content) {
            if (block.type !== 'text') continue;
            for (const c of (block as { citations?: unknown[] }).citations ?? []) {
              const cite = c as { url?: string; title?: string };
              push(cite.url, cite.title);
            }
          }

          if (sources.length === 0) {
            for (const block of final.content) {
              if (block.type !== 'web_search_tool_result') continue;
              const results = block.content;
              if (!Array.isArray(results)) continue; // an error object, not a result list
              for (const r of results) {
                if (r.type === 'web_search_result') push(r.url, r.title);
              }
            }
            /* Uncited fallback: a few, not the whole result page. */
            sources.splice(3);
          }

          /* Deduplicate — a channel touched by two tools shouldn't be listed twice. */
          const seen = new Set<string>();
          const unique = evidence.filter((e) => {
            const k = `${e.label}|${e.value}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });

          send(res, 200, {
            text,
            evidence: unique,
            sources,
            /* Nothing consulted at all means the model answered from the prompt
               alone — the case the UI should mark as a limit. A search-backed
               answer counts as consulted. */
            answered: unique.length > 0 || sources.length > 0,
            model: final.model,
            usage: final.usage,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          server.config.logger.error(`[assistant] ${message}`);
          send(res, 500, { error: 'model_failed', message });
        }
      });
    },
  };
}
