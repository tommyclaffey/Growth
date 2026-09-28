// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { SUGGESTIONS, ask } from '../assistant';
import { decisions, decisionsFor } from '../decisions';
import { CHANNEL_KEYS, CHANNEL_LABEL, setActiveChannels } from '../metrics';

const reset = () => setActiveChannels([...CHANNEL_KEYS]);

describe('the assistant became a decision agent', () => {
  it('answers "what should I do next" from the engine', () => {
    reset();
    const a = ask('What should I do next?', 30);
    expect(a.answered).toBe(true);
    /* It must report what the engine found, not improvise. The top finding's
       action has to appear verbatim. */
    const top = decisions(30).filter((c) => c.tier !== 3)[0];
    expect(a.text).toContain(top.action);
    expect(a.evidence?.length).toBeGreaterThan(0);
  });

  it('⭐ every follow-up it offers is one it can actually answer', () => {
    reset();
    /* 🐛 The bug this exists to prevent, and it shipped in the first draft: the
       panel offered "What can this data not tell me?" as a chip and then fell
       through to "I could not turn that into a question about this data."
       A generated prompt has to be tested against the matcher that receives it,
       or the conversation dead-ends on the product's own suggestion. */
    const seen = new Set<string>();
    const queue = [...SUGGESTIONS];

    while (queue.length > 0) {
      const q = queue.shift()!;
      if (seen.has(q)) continue;
      seen.add(q);
      const a = ask(q, 30);
      expect(a.answered, `dead end: "${q}"`).toBe(true);
      for (const f of a.followUps ?? []) if (!seen.has(f)) queue.push(f);
    }
    /* And it actually explored something, rather than passing on an empty set. */
    expect(seen.size).toBeGreaterThan(4);
  });

  it('every suggestion on the empty state is answerable', () => {
    reset();
    for (const s of SUGGESTIONS) {
      expect(ask(s, 30).answered, `dead end: "${s}"`).toBe(true);
    }
  });

  it('"why <action>" explains that specific finding', () => {
    reset();
    const top = decisions(30).filter((c) => c.tier !== 3)[0];
    const a = ask(`Why “${top.action}”?`, 30);
    expect(a.answered).toBe(true);
    expect(a.text).toContain(top.because);
  });
});

describe('🚨 "what should I cut" no longer takes the bait', () => {
  it('answers at the ad level and REFUSES at the channel level', () => {
    reset();
    /* The old branch ranked channels by CAC and named the most expensive one with
       a caveat after it. That is the podcast trap: right arithmetic, unsupportable
       recommendation, and a caveat at the end does not undo a headline. */
    const a = ask('What should I cut?', 30);
    expect(a.answered).toBe(true);
    expect(a.text).toMatch(/at the ad level/i);
    expect(a.text).toMatch(/at the CHANNEL level I would not answer it/i);
    /* It must not name the expensive channel as the thing to cut. */
    expect(a.text).not.toMatch(/cut (podcasts|paid search)/i);
  });

  it('names last-touch attribution as the reason it will not answer', () => {
    reset();
    const a = ask('Should I stop spending on podcasts?', 30);
    expect(a.text).toMatch(/last touch/i);
  });
});

describe('the limitation question is a first-class answer', () => {
  it('"what can this data not tell me" returns the tier 3 question', () => {
    reset();
    const a = ask('What can this data not tell me?', 30);
    expect(a.answered).toBe(true);
    const t3 = decisions(30).find((c) => c.tier === 3)!;
    expect(a.text).toContain(t3.action);
    /* And it says what WOULD answer it, rather than stopping at "I can't". */
    expect(a.text).toMatch(/incrementality|promo code/i);
  });

  it('a tier 2 answer states its assumption on its own line', () => {
    reset();
    const t2 = decisions(30).find((c) => c.tier === 2);
    if (!t2) return;
    const a = ask(`Why “${t2.action}”?`, 30);
    /* Folded into the expectation, a projection reads as a promise. */
    expect(a.text).toMatch(/⚠️ That assumes/);
  });

  it('answers are broken into paragraphs, not one block of prose', () => {
    reset();
    /* The panel splits on blank lines; an answer with none renders as a wall. */
    expect(ask('What should I do next?', 30).text.split('\n\n').length).toBeGreaterThan(2);
  });
});

describe('user-initiated: asking about a specific thing', () => {
  it('⭐ answers "what’s going on with X" for a channel', () => {
    reset();
    /* The pull side. The engine decides the agenda; this answers a question the
       agenda did not anticipate, from the same engine. */
    const a = ask("What's going on with Paid Search?", 30);
    expect(a.answered).toBe(true);
    expect(a.text).toContain('Paid Search');
    /* The numbers they are looking at come first. */
    expect(a.text).toMatch(/spend.*leads.*CAC/i);
  });

  it('names what it cannot say — every time, not only when the news is bad', () => {
    reset();
    /* A caveat that appears only alongside bad news reads as an excuse. Stated
       always, it is a property of the instrument. */
    for (const q of ["What's going on with Meta?", "What's going on with Podcasts?"]) {
      expect(ask(q, 30).text).toMatch(/cannot tell you about it/i);
    }
  });

  it('a channel question inherits findings from inside that channel', () => {
    reset();
    /* Asking about Paid Search should surface an ad-level pause running inside
       it, not only findings whose target id equals "paidSearch". */
    const inside = decisionsFor({ kind: 'channel', id: 'paidSearch' }, 30);
    expect(inside.some((c) => c.target.kind === 'ad')).toBe(true);
  });

  it('prefers the campaign when a campaign is named', () => {
    reset();
    /* The more specific match is the intent -- someone naming a campaign does
       not want its whole channel's answer. */
    const a = ask("Tell me about Non-brand — High Intent", 30);
    expect(a.answered).toBe(true);
    expect(a.text).toContain('Non-brand — High Intent');
  });

  it('falls back to the account when nothing is named', () => {
    reset();
    const a = ask("What's going on?", 30);
    expect(a.answered).toBe(true);
    expect(a.text).toMatch(/this account/i);
  });

  it('every question a row can generate is answerable', () => {
    reset();
    /* ⚠️ Same guard as the follow-up crawler: the channel table generates
       "What's going on with <name>?" per row, and a generated prompt has to be
       tested against the matcher that receives it. */
    for (const label of Object.values(CHANNEL_LABEL)) {
      expect(ask(`What's going on with ${label}?`, 30).answered,
        `dead end for ${label}`).toBe(true);
    }
  });
});
