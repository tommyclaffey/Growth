import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { IncomingMessage, ServerResponse } from 'node:http';
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

const SYSTEM = `You are the assistant inside Growth, a cross-channel marketing dashboard.

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
   Tier 1 is provable arithmetic — state it as a recommendation.
   Tier 2 is a projection — state it AND state its 'assuming' clause in the same
     breath. A projection whose assumption is left out reads as a promise.
   Tier 3 is a question this data CANNOT answer — never turn it into advice, even
     softened. Report it as the open question it is and name 'needsToAnswer'.
   ⚠️ The most striking number available is usually a tier 3: an expensive channel
   on last-touch. Cutting it is exactly what the data cannot justify, because
   last touch always flatters whichever channel sits nearest the conversion.

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

8. Be brief. Two or three sentences. This sits in a panel next to the charts,
   not in a report. Lead with the answer.

9. When someone asks what is going on with a metric, a channel, a campaign or an
   ad, answer in this order: the figures, then what the engine found about it,
   then what this data cannot tell them about it. Always the third part — a
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

Currency is USD. CAC is dollars per lead. ROAS is a multiple of spend.`;

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
  METRICS: string[];
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

  const campaign = campaigns.find((c) => q.includes(c.name.toLowerCase()));
  if (campaign) return { kind: 'campaign', id: campaign.id, label: campaign.name };

  for (const [key, label] of Object.entries(channelLabel)) {
    if (q.includes(label.toLowerCase()) || q.includes(key.toLowerCase())) {
      return { kind: 'channel', id: key, label };
    }
  }
  return undefined;
}
interface DecisionCandidate {
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
  m: Metrics, d: Decisions, b: Blended, cm: ChannelMetrics,
  range: number, evidence: Evidence[], subject?: Subject,
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
        + 'Each finding carries a tier: 1 is provable arithmetic, 2 is a projection with a '
        + 'stated assumption, 3 is a question this data CANNOT answer. '
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
        /* ⚠️ A SUBJECT WINS OVER THE MODEL'S OWN FILTER.

           When a control says what the reader was pointing at, that is what the
           question is ABOUT. The model cannot recover it from the sentence, and
           guessing produced the worst kind of answer: findings about a different
           campaign, each correct in itself, presented as the answer to a question
           about this one — with the other campaign's channel logos beside them. */
        const found = subject
          ? d.decisionsFor(subject, range, m.activeChannels())
          : d.decisions(range, m.activeChannels());
        const mine = !channel || channel === 'all'
          ? found : found.filter((c) => c.channel === channel);
        for (const c of mine.slice(0, 3)) {
          evidence.push(...c.evidence.slice(0, 2).map((e) => ({
            label: e.label, value: e.value, channel: c.channel,
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

        return JSON.stringify(mine.map((c) => ({
          tier: c.tier, action: c.action, because: c.because,
          expect: c.expectation?.outcome,
          assuming: c.expectation?.assuming,
          needsToAnswer: c.needs,
        })));
      },
    }),

    betaTool({
      name: 'get_delta',
      description:
        'Percentage change for one metric — the second half of the range against the first. Positive means the metric rose. Rising is not automatically good: a rising CAC is worse, a rising ROAS is better.',
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
        const key = metric.toLowerCase();
        const list = m.activeChannels().map((c) => {
          const t = m.totals(c, range);
          const value = key === 'sales' ? t.sales : (t[key] ?? 0);
          return { channel: m.CHANNEL_LABEL[c] ?? c, value, formatted: m.formatMetric(metric, value) };
        });
        /* Lower is better for CAC only. Everything else, higher wins. */
        list.sort((a, b) => (metric === 'CAC' ? a.value - b.value : b.value - a.value));
        list.forEach((r) => evidence.push({ label: `${r.channel} · ${metric}`, value: r.formatted }));
        return JSON.stringify({ metric, rangeDays: range, bestFirst: list });
      },
    }),

    betaTool({
      name: 'get_series',
      description:
        'The day-by-day values behind a metric. Use only when the shape over time matters — a spike, a trend, a specific day. For a single figure use get_totals; this returns a lot of points.',
      inputSchema: {
        type: 'object',
        properties: { scope: scopeProp, metric: metricProp },
        required: ['scope', 'metric'],
        additionalProperties: false,
      },
      run: ({ scope, metric }: { scope: string; metric: string }) => {
        const s = m.series(scope, metric, range);
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

async function readBody(
  req: IncomingMessage,
): Promise<{ question?: string; range?: number; subject?: Subject }> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return {};
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
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

        const { question, range = 30, subject } = await readBody(req);
        if (!question?.trim()) return send(res, 400, { error: 'Question required.' });

        try {
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
          /* Pure data, no React — safe to load here. */
          const { CAMPAIGNS } = (await server.ssrLoadModule('/src/data/campaigns.ts')) as
            unknown as { CAMPAIGNS: CampaignRec[] };

          const evidence: Evidence[] = [];
          const client = new Anthropic({ apiKey: key });

          const runner = client.beta.messages.toolRunner({
            model: MODEL,
            max_tokens: 4000,
            output_config: { effort: 'low' },
            system: SYSTEM,
            tools: [
              ...buildTools(
                m, d, b, cm, Number(range), evidence,
                /* What the caller said, or failing that what the question names. */
                (subject as Subject | undefined)
                  ?? inferSubject(String(question), CAMPAIGNS, m.CHANNEL_LABEL),
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
