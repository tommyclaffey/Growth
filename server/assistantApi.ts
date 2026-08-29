import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

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

Currency is USD. CAC is dollars per lead. ROAS is a multiple of spend.`;

interface Metrics {
  CHANNEL_KEYS: string[];
  CHANNEL_LABEL: Record<string, string>;
  totals: (scope: string, range: number) => Record<string, number>;
  delta: (scope: string, metric: string, range: number) => number;
  series: (scope: string, metric: string, range: number) => { label: string; value: number }[];
  formatMetric: (metric: string, value: number) => string;
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

function buildTools(m: Metrics, range: number, evidence: Evidence[]) {
  const scopeEnum = ['all', ...m.CHANNEL_KEYS];
  const metricEnum = ['Spend', 'Clicks', 'Leads', 'Sales', 'CAC', 'ROAS'];
  const label = (s: string) => (s === 'all' ? 'All channels' : m.CHANNEL_LABEL[s] ?? s);

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
        const d = m.delta(scope, metric, range);
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
        const list = m.CHANNEL_KEYS.map((c) => {
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

async function readBody(req: IncomingMessage): Promise<{ question?: string; range?: number }> {
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

        const { question, range = 30 } = await readBody(req);
        if (!question?.trim()) return send(res, 400, { error: 'Question required.' });

        try {
          /* Load the dashboard's own data layer through Vite so the tools call
             the exact functions the charts call — one source of truth. */
          const m = (await server.ssrLoadModule('/src/data/metrics.ts')) as unknown as Metrics;

          const evidence: Evidence[] = [];
          const client = new Anthropic({ apiKey: key });

          const runner = client.beta.messages.toolRunner({
            model: MODEL,
            max_tokens: 4000,
            output_config: { effort: 'low' },
            system: SYSTEM,
            tools: [
              ...buildTools(m, Number(range), evidence),
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
