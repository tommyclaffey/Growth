/**
 * Unsent message text, kept per conversation and across a close.
 *
 * The panel is rendered as `{chatOpen && <ChatPanel/>}`, so closing it does not
 * hide the composer -- it destroys it, and `draft` with it. Escape closes the
 * panel. Half a message and one keystroke was the only real data loss in the
 * app, and the component's own comment already said losing a draft was the
 * thing the Escape handler existed to avoid.
 *
 * Keyed by conversation. A single shared draft followed you between threads,
 * so a sentence written to one person appeared in the box addressed to
 * another -- a worse failure than losing it, because it is silent and sendable.
 */
const KEY = 'growth.drafts';

function read(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    /* Entry by entry: one bad value should not discard everyone else's
       unsent message. */
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
        .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''),
    );
  } catch {
    return {};
  }
}

let cache = read();

export function getDraft(conversationId: string): string {
  return cache[conversationId] ?? '';
}

export function setDraft(conversationId: string, text: string) {
  /* An empty draft is deleted rather than stored as "". Otherwise every
     conversation ever opened accumulates a key, and the quota this shares with
     a base64 avatar is not generous. */
  if (text === '') delete cache[conversationId];
  else cache[conversationId] = text;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch { /* quota — the draft still survives the close, just not a reload */ }
}

export function clearDraft(conversationId: string) {
  setDraft(conversationId, '');
}
