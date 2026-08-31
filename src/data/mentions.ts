import { ME, type Member } from './chat';
import type { Person } from './slackDirectory';

/**
 * @-mentions.
 *
 * Slack stores a mention as `<@U0123>` — an id, not a name — which is why a
 * renamed person's old messages still say the right thing. Growth has to write
 * that form on the way out and read it on the way back, and neither is the
 * text the person typed.
 */

/** The partial `@word` directly before the caret, if the caret is inside one. */
export function activeMention(text: string, caret: number): { query: string; start: number } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  /* Only a mention if the @ starts a word — an email address is not one. */
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  /* A space ends it: "@Dan " is finished, not still being typed. */
  if (/\s/.test(query)) return null;
  return { query, start: at };
}

/** Replaces the partial mention with the chosen name, and returns the new caret. */
export function applyMention(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const inserted = `@${name} `;
  return {
    text: text.slice(0, start) + inserted + text.slice(caret),
    caret: start + inserted.length,
  };
}

/**
 * `@Name` -> `<@U0123>` for Slack.
 *
 * Longest names first: with "Dan" and "Dan Kwon" both in the directory,
 * matching the short one first would turn "@Dan Kwon" into "<@Dan-id> Kwon".
 */
export function toSlackMentions(text: string, people: Person[]): string {
  const sorted = [...people].filter((p) => p.slackId).sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const p of sorted) {
    out = out.split(`@${p.name}`).join(`<@${p.slackId}>`);
  }
  return out;
}

/** Everyone named in a message, by display name. */
export function mentionedNames(body: string): string[] {
  return [...body.matchAll(/@([\p{L}][\p{L}\p{N}. '-]*)/gu)].map((m) => m[1].trim());
}

/**
 * Whether a message is addressed to the signed-in person.
 *
 * Matched on the local identity and on whatever Slack account is linked to it,
 * because the same human can be named either way.
 */
export function mentionsMe(body: string, me: Member = ME, linkedName?: string): boolean {
  const names = mentionedNames(body).map((n) => n.toLowerCase());
  const mine = [me.name, me.name.split(' ')[0], linkedName].filter(Boolean).map((n) => n!.toLowerCase());
  return names.some((n) => mine.some((m) => n === m || n.startsWith(m + ' ')));
}
