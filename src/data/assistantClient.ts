import {
  ask, decisionsForQuestion, followUpsFor, resolveSubject, type Answer,
} from './assistant';
import { flags } from './attention';
import { decisionsFor, decisions as allDecisions } from './decisions';
import type { Target } from './decisions';
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

/**
 * The local engine, wrapped so it can never be the thing that breaks.
 *
 * ask() is the FALLBACK, and it was being called from three places -- once
 * before the try block and twice inside catch handlers -- so when it threw, the
 * throw escaped every one of them. Assistant.tsx has no try/finally, so
 * setPending(null) never ran and the panel sat on its spinner, rejecting every
 * later question for the life of the session. One bad answer bricked the
 * feature.
 *
 * A fallback that can throw is not a fallback.
 */
function askSafely(question: string, range: Range, subject?: Target): Answer {
  try {
    return ask(question, range, subject);
  } catch {
    return {
      answered: false,
      text: 'I could not work that one out. Try naming a channel and a metric — for example, "Meta CAC over the last 30 days".',
    };
  }
}

export async function askAssistant(
  question: string, range: Range, explicit?: Target,
): Promise<Reply> {
  /* ⭐ Resolved ONCE, here, for every path into the assistant.
   *
   * A control's subject wins — it knows an id and text matching cannot beat
   * that — but a follow-up chip and a typed question both arrive without one,
   * and both are about something. Falling back to the text is what stops the
   * server answering a scoped question with the whole account. */
  const subject = explicit ?? resolveSubject(question);
  const taken = flags().filter((f) => f.kind === 'decision').map((f) => f.refId);
  if (endpointAvailable === false) {
    return { answer: askSafely(question, range, subject), source: 'local' };
  }

  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* 🐛 `subject` was never sent. The model got a bare question, called
         get_decisions with no filter, and reported the whole account — so asking
         about a Meta campaign came back with Paid Search findings and Paid
         Search logos beside them. The marks were right per row; the FINDINGS
         were wrong for the question, which is a much worse failure wearing a
         cosmetic one's clothes. */
      /* ⭐ What the reader has ALREADY decided travels too.
       *
       * 🐛 Without it the model narrated every finding while the client offered
       * buttons only for the untaken ones — prose describing three things, one
       * button beneath it, and nothing explaining where the other two went. The
       * remaining button looked arbitrary because from the reader's side it was.
       *
       * The engine is one source of judgement; this keeps it one source of
       * ATTENTION too. A decision already on the queue is not a suggestion any
       * more, and the narration should stop treating it as one. */
      /* ⭐ THE FINDINGS THEMSELVES, not the inputs to recompute them.
        *
        * 🐛 The server was running the engine again from its own state — and it
        * has no localStorage, so `stageOf` fell back to the SEEDED campaign
        * stages. Set a campaign Active in the UI and the client found a finding
        * the server could not: prose saying "no findings on TikTok" directly
        * above a TikTok finding with a button on it.
        *
        * Active channels, the monthly budget, campaign status and the taken list
        * all live client-side, so ANY of them diverges the two evaluations. The
        * claim that one engine backs every surface was quietly false the moment a
        * user changed anything.
        *
        * Sending the computed findings makes it true. The model narrates exactly
        * what the buttons offer because they are the same array, and no amount of
        * client state can pull them apart again. */
      body: JSON.stringify({
        question,
        range,
        subject,
        findings: (subject ? decisionsFor(subject, range) : allDecisions(range))
          .filter((c) => !taken.includes(c.id)),
      }),
    });

    if (!res.ok) {
      /* 503 means the endpoint is there but unconfigured — a missing key, not a
         missing server. Keep trying: the key can appear on the next restart. */
      if (res.status !== 503) endpointAvailable = false;
      return { answer: askSafely(question, range, subject), source: 'local' };
    }

    const data = (await res.json()) as Answer;
    endpointAvailable = true;
    /* An empty response body is a failure that returned 200. Treat it as one. */
    if (!data.text?.trim()) return { answer: askSafely(question, range, subject), source: 'local' };

    /* ⭐ Follow-ups attached HERE, not asked of the model.

       They are a product behaviour -- where this panel thinks you should go next
       -- and letting the model author them would make the route onward vary with
       the answer, which is the one part of the conversation that should not. It
       also meant they disappeared entirely the moment a key was configured,
       because the server returns none. Same rule, both paths. */
    return {
      answer: {
        ...data,
        followUps: data.followUps ?? followUpsFor(question, subject),
        /* Same reasoning as the follow-ups: the server returns prose and no ids,
           so the accept buttons come from the engine on both paths. They match
           what the model described by construction -- it was told to report
           get_decisions, and this reads the same function. */
        decisions: data.decisions ?? decisionsForQuestion(question, range, subject),
      },
      source: 'model',
    };
  } catch {
    endpointAvailable = false;
    return { answer: askSafely(question, range, subject), source: 'local' };
  }
}
