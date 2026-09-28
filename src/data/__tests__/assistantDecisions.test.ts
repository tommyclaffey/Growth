// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { SUGGESTIONS, ask, decisionsForQuestion, followUpsFor } from '../assistant';
import { decisions, decisionsFor } from '../decisions';
import { CAMPAIGNS } from '../campaigns';
import { creativesFor } from '../creative';
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

describe('🚨 every subject any surface can raise is answerable', () => {
  /* ⚠️ The guard, now applied exhaustively rather than per-surface.

     Four surfaces generate questions for the agent: channel rows, campaign rows,
     ad rows, and KPI cards. Each one builds its string independently, and a
     button that hands the agent something it cannot parse looks like the agent is
     broken -- the user cannot tell a bad question from a bad assistant.

     This enumerates the same strings the components build. If a surface changes
     its phrasing without the matcher following, this fails. */

  it('channel rows', () => {
    reset();
    for (const label of Object.values(CHANNEL_LABEL)) {
      const a = ask(`What's going on with ${label}?`, 30);
      expect(a.answered, label).toBe(true);
      expect(a.text, label).toContain(label);
    }
  });

  it('campaign rows', () => {
    reset();
    for (const c of CAMPAIGNS) {
      const a = ask(`What's going on with ${c.name}?`, 30);
      expect(a.answered, c.name).toBe(true);
      expect(a.text, c.name).toContain(c.name);
    }
  });

  it('⭐ ad rows resolve to the exact AD, by id', () => {
    reset();
    /* 🐛 The bug that forced identity-passing: ad headlines are NOT unique. The
       copy generator cycles a fixed set of hooks, so "Start free, no card"
       exists in several campaigns. Matching on the headline returned whichever
       came first -- click Ask on a TikTok ad, get a confident answer about a
       Meta ad with the same words, evidence attached.

       The row now passes {kind:'ad', id} the way the component does, so the
       question text stays human while the resolution stays exact. */
    for (const c of CAMPAIGNS) {
      for (const ad of creativesFor(c.id)) {
        const a = ask(`What's going on with “${ad.headline}”?`, 30,
          { kind: 'ad', id: ad.id, label: ad.headline });
        expect(a.answered, ad.id).toBe(true);
        expect(a.text, ad.id).toContain(ad.headline);
        /* THE assertion: the right campaign, even when the headline is shared. */
        expect(a.text, ad.id).toContain(c.name);
      }
    }
  });

  it('a duplicated headline resolves to different ads by id', () => {
    reset();
    /* Proves the ambiguity is real and that identity resolves it, rather than
       trusting that it would. */
    const all = CAMPAIGNS.flatMap((c) => creativesFor(c.id).map((ad) => ({ c, ad })));

    const byHeadline = new Map<string, typeof all>();
    for (const item of all) {
      byHeadline.set(item.ad.headline, [...(byHeadline.get(item.ad.headline) ?? []), item]);
    }
    /* A headline used by ads in two DIFFERENT campaigns is the ambiguous case. */
    const shared = [...byHeadline.values()].find(
      (group) => new Set(group.map((g) => g.c.id)).size > 1);
    expect(shared, 'expected a headline shared across campaigns').toBeDefined();

    const a = shared!.find((x) => x.c.id !== shared![0].c.id)!;
    const b = shared![0];

    const qa = ask(`What's going on with “${a.ad.headline}”?`, 30,
      { kind: 'ad', id: a.ad.id, label: a.ad.headline });
    const qb = ask(`What's going on with “${b.ad.headline}”?`, 30,
      { kind: 'ad', id: b.ad.id, label: b.ad.headline });

    /* Same words typed, different ads answered — each naming its own campaign. */
    expect(qa.text).toContain(a.c.name);
    expect(qb.text).toContain(b.c.name);
    expect(qa.text).not.toBe(qb.text);
  });

  it('KPI cards, blended and per-channel', () => {
    reset();
    const RATES = ['CTR', 'CPC', 'CPM', 'CVR', 'CAC', 'ROAS'];
    for (const m of ['Spend', 'Leads', 'CAC', 'ROAS', 'Impressions', 'Clicks', 'CTR']) {
      const blended = RATES.includes(m) ? `Blended ${m}` : `Total ${m.toLowerCase()}`;
      expect(ask(`What's going on with ${blended}?`, 30).answered, blended).toBe(true);
      for (const label of Object.values(CHANNEL_LABEL)) {
        expect(ask(`What's going on with ${m} on ${label}?`, 30).answered,
          `${m} on ${label}`).toBe(true);
      }
    }
  });
});

describe('the follow-up leads to a decision, not an explanation', () => {
  it('⭐ "what’s going on" offers "what would you do" FIRST', () => {
    reset();
    /* Tommy: "make the very next prompt after we say what's going on prompt it
       immediately to ask what decision it would make."

       Someone who just read what is going on has exactly one next question, and
       it is not "why did you say that" -- it is "so what would you do". Leading
       with the explanation answers a question they have not asked yet. */
    const a = ask("What's going on with Meta?", 30);
    expect(a.followUps?.[0]).toMatch(/what would you do/i);
    expect(a.followUps?.[0]).toContain('Meta');
  });

  it('and that follow-up is answerable, scoped to the same subject', () => {
    reset();
    for (const label of Object.values(CHANNEL_LABEL)) {
      const first = ask(`What's going on with ${label}?`, 30).followUps![0];
      const next = ask(first, 30);
      expect(next.answered, first).toBe(true);
      expect(next.text, first).toContain(label);
    }
  });

  it('gives calls, or says there are none — never fills the space', () => {
    reset();
    const a = ask('What would you do about Meta?', 30);
    expect(a.answered).toBe(true);
    expect(a.text).toMatch(/call on Meta|calls on Meta|Nothing about Meta/);
  });

  it('a subject with no supportable action says so plainly', () => {
    reset();
    /* The honest empty answer, rather than a manufactured suggestion. */
    const a = ask('What would you do about Podcasts?', 30);
    expect(a.answered).toBe(true);
    if (/Nothing about/.test(a.text)) {
      expect(a.text).toMatch(/rather say that than manufacture/i);
    }
  });

  it('routes "what would you do" before "what’s going on"', () => {
    reset();
    /* Both branches match a subject; ordering decides which question gets
       answered. Wrong order and the decision prompt returns a status report. */
    const a = ask('What would you do about Paid Search?', 30);
    expect(a.text).not.toMatch(/spend,.*leads,.*CAC\./);
  });
});

describe('🚨 follow-ups do not depend on which engine answered', () => {
  it('the shared rule puts the DECISION first after a status question', () => {
    reset();
    /* 🐛 The chips shipped as something the LOCAL engine attached to its own
       answers. The moment an API key was configured and the model started
       replying, they vanished — the decision-first prompt existed only on the
       path Tommy was not using. */
    const f = followUpsFor("What's going on with Meta?", { kind: 'channel', label: 'Meta' });
    expect(f[0]).toMatch(/what would you do about meta/i);
  });

  it('covers every question shape the panel can produce', () => {
    reset();
    const shapes = [
      "What's going on with Meta?",
      'What would you do about Meta?',
      'What can this data not tell me?',
      'What should I do next?',
      'What should I cut?',
      'How much did we spend on TikTok?',
    ];
    for (const q of shapes) {
      const f = followUpsFor(q);
      expect(f.length, q).toBeGreaterThan(0);
      /* And every chip it offers must itself be answerable — the guard that has
         now caught this class of bug four times. */
      for (const chip of f) expect(ask(chip, 30).answered, `${q} -> ${chip}`).toBe(true);
    }
  });

  it('a lookup still gets a route onward', () => {
    reset();
    /* The difference between a search box and a thought partner: even a plain
       "how much did we spend" offers somewhere to go. */
    expect(followUpsFor('How much did we spend on TikTok?').length).toBeGreaterThan(0);
  });

  it('the local engine returns the same chips the shared rule would', () => {
    reset();
    /* If these drift, the panel behaves differently depending on whether a key
       is configured — which is the exact thing assistantClient exists to
       prevent everywhere else. */
    const q = "What's going on with Paid Search?";
    const local = ask(q, 30);
    expect(local.followUps).toEqual(
      followUpsFor(q, { kind: 'channel', label: 'Paid Search' }));
  });
});

describe('the conversation ends in a decision you can take', () => {
  it('a "what would you do" answer carries takeable decisions', () => {
    reset();
    const a = ask('What would you do about Paid Search?', 30);
    expect(a.decisions?.length).toBeGreaterThan(0);
    /* Each one must name the finding, so the button is not a mystery box. */
    for (const d of a.decisions!) {
      expect(d.action.length).toBeGreaterThan(4);
      expect(d.id).toBeTruthy();
    }
  });

  it('🚨 a tier 3 finding is NEVER takeable', () => {
    reset();
    /* The assertion this whole tier model exists for. A question has nothing to
       take; a button there turns the refusal back into the recommendation it was
       built to prevent. */
    const t3 = decisions(30).filter((c) => c.tier === 3);
    expect(t3.length).toBeGreaterThan(0);
    const t3ids = new Set(t3.map((c) => c.id));

    for (const q of ['What should I do next?', 'What should I cut?',
      "What's going on with Podcasts?", 'What would you do about Podcasts?']) {
      for (const d of ask(q, 30).decisions ?? []) {
        expect(t3ids.has(d.id), `${q} offered a tier 3: ${d.action}`).toBe(false);
        expect(d.tier).not.toBe(3);
      }
    }
  });

  it('takeable ids match real candidates, so accepting lands on the right thing', () => {
    reset();
    const all = new Map(decisions(30).map((c) => [c.id, c]));
    const a = ask('What should I do next?', 30);
    for (const d of a.decisions ?? []) {
      const real = all.get(d.id);
      expect(real, d.id).toBeDefined();
      expect(real!.action).toBe(d.action);
    }
  });

  it('a plain lookup sprouts no accept buttons', () => {
    reset();
    /* Buttons for findings the answer never mentioned would be the panel acting
       on its own initiative. */
    expect(decisionsForQuestion('How much did we spend on TikTok?', 30)).toEqual([]);
  });

  it('the shared rule gives the model path the same decisions', () => {
    reset();
    /* Identical reasoning to the follow-ups: the server returns prose and no
       ids, so if these drift the panel behaves differently depending on whether
       a key is configured. */
    const q = 'What would you do about Paid Search?';
    const local = ask(q, 30, { kind: 'channel', id: 'paidSearch', label: 'Paid Search' });
    const shared = decisionsForQuestion(q, 30,
      { kind: 'channel', id: 'paidSearch', label: 'Paid Search' });
    expect(local.decisions?.map((d) => d.id)).toEqual(shared.map((d) => d.id));
  });
});

describe('⭐ the button appears where the decision is argued, not before', () => {
  it('a STATUS answer carries no takeable decisions', () => {
    reset();
    /* "What's going on with Total spend" reports: the figures, a finding the
       engine raised, and what this data cannot tell you. Nothing has been
       weighed. Asking the reader to commit there skips the deliberation the
       panel exists to host — and a button under every answer stops reading as a
       commitment and starts reading as decoration. */
    for (const q of ["What's going on with Total spend?", "What's going on with Meta?",
      'Tell me about Paid Search', 'How is TikTok doing?']) {
      const a = ask(q, 30);
      expect(a.answered, q).toBe(true);
      expect(a.decisions ?? [], q).toEqual([]);
    }
  });

  it('but it routes you to where the button IS', () => {
    reset();
    /* The two-step is the point: ask, then decide. The status answer's first
       chip has to lead to the decision answer, or the button is unreachable. */
    const status = ask("What's going on with Meta?", 30);
    const next = status.followUps![0];
    expect(next).toMatch(/what would you do/i);
    expect(ask(next, 30).decisions?.length, next).toBeGreaterThan(0);
  });

  it('a DECISION answer carries them', () => {
    reset();
    for (const q of ['What would you do about Meta?', 'What should I do next?',
      'What should I cut?']) {
      const a = ask(q, 30);
      if (!/Nothing/.test(a.text)) {
        expect(a.decisions?.length, q).toBeGreaterThan(0);
      }
    }
  });

  it('the whole two-step works end to end', () => {
    reset();
    /* Status -> follow the first chip -> decision -> a real candidate id that
       accepting would land on. */
    const step1 = ask("What's going on with Paid Search?", 30);
    expect(step1.decisions ?? []).toEqual([]);

    const step2 = ask(step1.followUps![0], 30);
    const take = step2.decisions![0];
    expect(take).toBeDefined();
    expect(decisions(30).some((c) => c.id === take.id)).toBe(true);
  });
});

describe('a decision is identified the same way wherever you meet it', () => {
  it('takeable rows carry the channel and what they touch', () => {
    reset();
    /* ⚠️ A decision named only by its action loses which account it touches.
       "Decide on Non-brand — High Intent" and "Review pacing" look like the same
       KIND of thing in a list, and one is a Paid Search campaign while the other
       is the whole account. The card on the Decisions screen carries the mark;
       the button row did not, so the same decision was identified two different
       ways depending on where you met it. */
    const takeable = ask('What should I do next?', 30).decisions!;
    expect(takeable.length).toBeGreaterThan(0);
    for (const d of takeable) {
      expect(d.context, d.action).toBeTruthy();
    }
    /* At least one is channel-scoped and carries a mark; account-level ones
       correctly do not. */
    expect(takeable.some((d) => d.channel)).toBe(true);
  });

  it('an account-level decision says so rather than showing nothing', () => {
    reset();
    const pacing = ask('What should I do next?', 30).decisions!
      .find((d) => /pacing/i.test(d.action));
    if (!pacing) return;
    expect(pacing.channel).toBeUndefined();
    /* The account is a scope, not the absence of one. */
    expect(pacing.context).toBe('This account');
  });

  it('context matches the candidate it came from', () => {
    reset();
    const all = new Map(decisions(30).map((c) => [c.id, c]));
    for (const d of ask('What should I do next?', 30).decisions ?? []) {
      const c = all.get(d.id)!;
      expect(d.channel).toBe(c.channel);
      /* One decision, one address — the panel row and the card must not derive
         it separately or they drift. */
      expect(d.context).toBe(c.scope.join(' \u203a '));
    }
  });
});
