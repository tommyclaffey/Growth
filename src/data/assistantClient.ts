import { ask, type Answer } from './assistant';
import type { Range } from './metrics';

/**
 * Routes a question to the model if one is reachable, and to the deterministic
 * engine if not.
 *
 * THE FALLBACK IS THE FEATURE, not error handling bolted on. `/api/assistant`
 * exists only on the dev server, so:
 *
 *   - locally, with a key present  -> the model answers, using tools that read
 *                                     the dashboard's own data functions
 *   - the deployed public build    -> no endpoint, so it falls back silently to
 *                                     the deterministic engine
 *
 * Which means the public site can never spend money and can never hallucinate,
 * and the model version needs no build flag, no separate branch, and no
 * remembering. The safe thing is what happens when nothing is configured.
 */

export type AnswerSource = 'model' | 'local';
export interface Reply { answer: Answer; source: AnswerSource }

/**
 * Whether a model is actually reachable — asked before any question is sent.
 *
 * The panel tells the user in its footer whether a model is answering. That is
 * a claim about the system, so it gets checked. Deriving it from the last
 * answer meant the empty state asserted "no model behind this" while a model
 * sat behind it, which is precisely the kind of confident-and-wrong the rest of
 * this build exists to avoid.
 *
 * `null` means not yet known: say nothing rather than guess.
 */
export async function probeModel(): Promise<boolean> {
  try {
    const res = await fetch('/api/assistant');
    if (!res.ok) return false;
    const { available } = (await res.json()) as { available?: boolean };
    return Boolean(available);
  } catch {
    return false;
  }
}

/** Cached after the first miss so a static build stops re-attempting the fetch. */
let endpointAvailable: boolean | null = null;

export async function askAssistant(question: string, range: Range): Promise<Reply> {
  if (endpointAvailable === false) return { answer: ask(question, range), source: 'local' };

  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, range }),
    });

    if (!res.ok) {
      /* 503 means the endpoint is there but unconfigured — a missing key, not a
         missing server. Keep trying: the key can appear on the next restart. */
      if (res.status !== 503) endpointAvailable = false;
      return { answer: ask(question, range), source: 'local' };
    }

    const data = (await res.json()) as Answer;
    endpointAvailable = true;
    /* An empty response body is a failure that returned 200. Treat it as one. */
    if (!data.text?.trim()) return { answer: ask(question, range), source: 'local' };
    return { answer: data, source: 'model' };
  } catch {
    endpointAvailable = false;
    return { answer: ask(question, range), source: 'local' };
  }
}
