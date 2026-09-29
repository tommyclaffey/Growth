// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Decisions } from '../Decisions';
import { decisions, figuresFor } from '../../data/decisions';
import { ALL_CHANNELS } from '../../data/blended';
import { CHANNEL_KEYS, setActiveChannels } from '../../data/metrics';
import { setChannels } from '../../data/channels';
import { ask } from '../../data/assistant';
import { dismissals, restore } from '../../data/dismissedDecisions';
import { addFlag, flags, isFlagged, ownDecisionId, removeFlag } from '../../data/attention';

/* ⚠️ Both stores hold a module-level cache that `localStorage.clear()` does NOT
   reset -- the cache is the source of truth in memory and storage is only its
   backing. Clearing storage alone let dismissals leak between tests, so the
   "Dismissed (1)" button was actually rendering "Dismissed (2)" by the third
   test. Unwound through the real API instead. */
afterEach(() => {
  cleanup();
  for (const d of [...dismissals()]) restore(d.id);
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
});

const all = () => decisions(30, ALL_CHANNELS);

describe('Decisions renders the queue', () => {
  it('renders one card per live finding', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    expect(container.querySelectorAll('.gr-dec__card')).toHaveLength(all().length);
  });

  it('⭐ the causal question is LAST, under a section that refuses it', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const cards = [...container.querySelectorAll('.gr-dec__card')];
    const last = cards[cards.length - 1];
    /* The biggest dollar figure in the product sits here, and it is the one the
       data cannot support. An impact-ranked list would put it first. */
    expect(last.textContent).toMatch(/Is Podcasts spend creating demand/);
    expect(last.className).toMatch(/is-tier-3/);
    expect(screen.getByText(/These are/).textContent).toMatch(/not recommendations/i);
  });

  it('a tier 3 card offers no Accept button', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const t3 = container.querySelector('.gr-dec__card.is-tier-3')!;
    /* Accepting a question would turn it back into the recommendation the tier
       exists to refuse. */
    expect(within(t3 as HTMLElement).queryByRole('button', { name: /^accept$/i })).toBeNull();
    expect(within(t3 as HTMLElement).getByText(/To answer this you need/)).toBeTruthy();
  });

  it('a tier 2 card shows its assumption on its own line', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const t2 = container.querySelector('.gr-dec__card.is-tier-2');
    if (!t2) return;                      // none in the default account
    expect(t2.querySelector('.gr-dec__assuming')).toBeTruthy();
  });

  it('every card shows its evidence', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    for (const card of container.querySelectorAll('.gr-dec__card')) {
      expect(card.querySelectorAll('.gr-dec__evidence dt').length).toBeGreaterThan(0);
    }
  });
});

describe('Accept and Dismiss actually do something', () => {
  it('⭐ Accept MOVES it out of the proposals and into your queue', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);

    const section = (name: RegExp) => [...container.querySelectorAll('.gr-dec__tier')]
      .find((s) => name.test(s.querySelector('h3')?.textContent ?? ''));

    const card = container.querySelector('.gr-dec__card.is-tier-1') as HTMLElement;
    const action = card.querySelector('.gr-dec__action')!.textContent!;
    expect(section(/Decided/)).toBeUndefined();

    fireEvent.click(within(card).getByRole('button', { name: /^accept$/i }));

    /* A proposal and a commitment are different states, so they get different
       places -- not the same place with a badge. Leaving it in the list is what
       made three taken decisions impossible to find. */
    const queue = section(/Decided/)!;
    expect(queue).toBeDefined();
    expect(queue.textContent).toContain(action);
    /* And it is gone from the tier it came from. */
    const doThese = section(/ready to act/i);
    expect(doThese?.textContent ?? '').not.toContain(action);

    fireEvent.click(within(queue as HTMLElement).getByRole('button', { name: /^undo$/i }));
    expect(section(/Decided/)).toBeUndefined();
    expect(section(/ready to act/i)!.textContent).toContain(action);
  });

  it('Dismiss takes a reason and removes the card', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const before = container.querySelectorAll('.gr-dec__card').length;
    const card = container.querySelector('.gr-dec__card') as HTMLElement;

    fireEvent.click(within(card).getByRole('button', { name: /dismiss/i }));
    const input = within(card).getByPlaceholderText(/why not/i);
    fireEvent.change(input, { target: { value: 'already tried this' } });
    fireEvent.click(within(card).getByRole('button', { name: /save/i }));

    expect(container.querySelectorAll('.gr-dec__card').length).toBe(before - 1);
  });

  it('a dismissal is reversible, and remembers the reason', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const card = container.querySelector('.gr-dec__card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /dismiss/i }));
    fireEvent.change(within(card).getByPlaceholderText(/why not/i),
      { target: { value: 'brand play, not a lead play' } });
    fireEvent.click(within(card).getByRole('button', { name: /save/i }));

    /* G-001: every state change here has to be reversible. */
    fireEvent.click(screen.getByRole('button', { name: /dismissed \(1\)/i }));
    expect(screen.getByText(/brand play, not a lead play/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /restore/i }));
    expect(screen.queryByText(/brand play, not a lead play/)).toBeNull();
  });
});

describe('the route into the conversation', () => {
  it('“Talk about this” asks the assistant about THAT finding', () => {
    setChannels([...CHANNEL_KEYS]);
    const asked: string[] = [];
    const { container } = render(<Decisions range={30} onDiscuss={(q) => asked.push(q)} />);
    const card = container.querySelector('.gr-dec__card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /talk about this/i }));
    expect(asked).toHaveLength(1);
    /* The question must name the finding, or the panel opens with no context and
       the reader has to re-type what they were already looking at. */
    expect(asked[0]).toContain(all()[0].action);
  });

  it('a tier 3 card can be argued with too', () => {
    setChannels([...CHANNEL_KEYS]);
    const asked: string[] = [];
    const { container } = render(<Decisions range={30} onDiscuss={(q) => asked.push(q)} />);
    const t3 = container.querySelector('.gr-dec__card.is-tier-3') as HTMLElement;
    /* It needs this most: "why won't you answer that?" is exactly the question a
       refusal provokes, and the refusal is worthless if there is nowhere to ask. */
    expect(within(t3).getByRole('button', { name: /talk about this/i })).toBeTruthy();
    fireEvent.click(within(t3).getByRole('button', { name: /talk about this/i }));
    expect(asked[0]).toMatch(/Is Podcasts spend creating demand/);
  });

  it('the question it stages is one the assistant can answer', () => {
    setChannels([...CHANNEL_KEYS]);
    const asked: string[] = [];
    const { container } = render(<Decisions range={30} onDiscuss={(q) => asked.push(q)} />);
    const card = container.querySelector('.gr-dec__card') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /talk about this/i }));
    /* ⚠️ Same class of bug as the dead-end follow-up chip: a button that hands the
       assistant a question it cannot parse looks like the agent is broken. */
    expect(ask(asked[0], 30).answered).toBe(true);
  });
});

describe('the empty case is a real answer', () => {
  it('says the engine found nothing rather than showing a blank screen', () => {
    setChannels([]);
    render(<Decisions range={30} />);
    expect(screen.getByText(/Nothing to decide on right now/)).toBeTruthy();
    setActiveChannels([...CHANNEL_KEYS]);
    setChannels([...CHANNEL_KEYS]);
  });
});

describe('the assistant and the Decisions screen share one queue', () => {
  it('⭐ a decision taken in the conversation appears as accepted on the screen', () => {
    setChannels([...CHANNEL_KEYS]);
    /* The loop Tommy asked for: converse, decide, and it lands in the pile.
       Both surfaces read the same store, so accepting in one is accepting in
       the other — there is no syncing and nothing to drift. */
    const takeable = ask('What should I do next?', 30).decisions!;
    expect(takeable.length).toBeGreaterThan(0);

    const first = takeable[0];
    addFlag('decision', first.id, first.action);

    const { container } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((c) => c.textContent?.includes(first.action))!;
    expect(card, first.action).toBeDefined();
    /* Accepted = it sits under Decided, offers Undo, and no longer offers Accept. */
    expect(card.closest('.gr-dec__tier')!.className).toMatch(/is-queue/);
    expect(within(card as HTMLElement).getByRole('button', { name: 'Undo' })).toBeTruthy();
    expect(within(card as HTMLElement).queryByRole('button', { name: /^accept$/i })).toBeNull();
    expect(within(card as HTMLElement).queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });

  it('and undoing on the screen clears it for the conversation too', () => {
    setChannels([...CHANNEL_KEYS]);
    const first = ask('What should I do next?', 30).decisions![0];
    addFlag('decision', first.id, first.action);

    const { container } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((c) => c.textContent?.includes(first.action)) as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^undo$/i }));

    expect(isFlagged('decision', first.id)).toBe(false);
  });
});

describe('taking more than one, and writing your own', () => {
  it('⭐ multiple decisions can be taken at once', () => {
    setChannels([...CHANNEL_KEYS]);
    /* "It shouldn't be just choose one." It never was — the buttons are
       independent — but the heading said "Take one", which invented a constraint
       the code does not have. Asserting the behaviour so the label can never
       drift back. */
    const takeable = ask('What should I do next?', 30).decisions!;
    expect(takeable.length).toBeGreaterThan(1);
    for (const d of takeable) addFlag('decision', d.id, d.action);
    for (const d of takeable) expect(isFlagged('decision', d.id), d.action).toBe(true);

    const { container } = render(<Decisions range={30} />);
    /* All three land in one place, which is the whole point -- scattered among
       the proposals they were impossible to find. */
    const queue = [...container.querySelectorAll('.gr-dec__tier')]
      .find((s) => /Decided/.test(s.querySelector('h3')?.textContent ?? ''))!;
    expect(queue.querySelectorAll('.gr-dec__card')).toHaveLength(takeable.length);
    for (const d of takeable) expect(queue.textContent, d.action).toContain(d.action);
  });

  it('a written decision reaches the queue and the screen', () => {
    setChannels([...CHANNEL_KEYS]);
    /* Without a section for them these land in the store and then vanish from
       the screen that IS the queue — nothing in decisions() would render a flag
       with no candidate behind it. */
    addFlag('decision', ownDecisionId('Move $8k to affiliates'), 'Move $8k to affiliates');
    render(<Decisions range={30} />);
    expect(screen.getByText('Move $8k to affiliates')).toBeTruthy();
    expect(screen.getByText(/Decided/)).toBeTruthy();
  });

  it('and stays visibly separate from the engine’s findings', () => {
    setChannels([...CHANNEL_KEYS]);
    /* G-001's rule about the kinds of attention this queue holds. "Growth
       suggested this and you agreed" and "you decided this yourself" are
       different claims. */
    addFlag('decision', ownDecisionId('Pause everything on Fridays'), 'Pause everything on Fridays');
    const { container } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((c) => c.textContent?.includes('Pause everything on Fridays'))!;
    expect(card.className).toMatch(/is-own/);
    /* No evidence panel — there is nothing to check it against, and pretending
       otherwise would be the panel borrowing authority it has not earned. */
    expect(card.querySelector('.gr-dec__evidence')).toBeNull();
  });

  it('writing the same decision twice is idempotent', () => {
    setChannels([...CHANNEL_KEYS]);
    const id = ownDecisionId('Shift budget to TikTok');
    addFlag('decision', id, 'Shift budget to TikTok');
    addFlag('decision', ownDecisionId('  Shift Budget To TikTok  '), 'Shift budget to TikTok');
    render(<Decisions range={30} />);
    expect(screen.getAllByText('Shift budget to TikTok')).toHaveLength(1);
  });

  it('a written decision can be removed', () => {
    setChannels([...CHANNEL_KEYS]);
    addFlag('decision', ownDecisionId('Test a new hook'), 'Test a new hook');
    const { container } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((c) => c.textContent?.includes('Test a new hook')) as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /remove/i }));
    expect(screen.queryByText('Test a new hook')).toBeNull();
  });
});

describe('decisions live in the queue, not in the attention strip', () => {
  it('🚨 "Clear all" on the strip must not wipe the decision queue', () => {
    setChannels([...CHANNEL_KEYS]);
    /* The strip stopped showing decisions, so a Clear-all that removed every
       flag would have deleted them invisibly — no undo, nothing on screen
       admitting it. A control acting outside its own visible scope.

       This asserts the rule the handler relies on: the set it clears and the set
       it displays are the same set. */
    const taken = ask('What should I do next?', 30).decisions![0];
    addFlag('decision', taken.id, taken.action);
    addFlag('decision', ownDecisionId('Keep this'), 'Keep this');
    addFlag('campaign', 'c1', 'Flagged by hand');

    const shown = flags().filter((f) => f.kind !== 'decision');
    const kept = flags().filter((f) => f.kind === 'decision');

    /* What the strip shows is only the non-decision flags... */
    expect(shown.map((f) => f.label)).toEqual(['Flagged by hand']);
    /* ...and the decisions it does not show are the ones that must survive. */
    expect(kept).toHaveLength(2);

    shown.forEach((f) => removeFlag(f.kind, f.refId));

    expect(isFlagged('decision', taken.id)).toBe(true);
    expect(isFlagged('decision', ownDecisionId('Keep this'))).toBe(true);
    expect(isFlagged('campaign', 'c1')).toBe(false);
  });

  it('a decision still reaches the Decisions screen after the strip is cleared', () => {
    setChannels([...CHANNEL_KEYS]);
    addFlag('decision', ownDecisionId('Survives a clear'), 'Survives a clear');
    flags().filter((f) => f.kind !== 'decision').forEach((f) => removeFlag(f.kind, f.refId));
    render(<Decisions range={30} />);
    expect(screen.getByText('Survives a clear')).toBeTruthy();
  });
});

describe('the queue is ordered by when you decided', () => {
  it('⭐ newest first, regardless of what the engine thinks', () => {
    setChannels([...CHANNEL_KEYS]);
    /* Taken cards came out in engine order (tier, then strength) while written
       ones came out newest-first, so the thing you just added could land
       anywhere. A queue you are working is read top-down, and the item you just
       put there is the one you are still thinking about.

       ⚠️ Ordered from the FLAG, not the candidate — only the flag knows when the
       decision was made. Sorting by the engine means the queue of YOUR
       commitments is sorted by the engine's opinion of importance. */
    const takeable = ask('What should I do next?', 30).decisions!;
    addFlag('decision', takeable[0].id, takeable[0].action);
    addFlag('decision', takeable[1].id, takeable[1].action);
    addFlag('decision', ownDecisionId('Last thing I decided'), 'Last thing I decided');

    const { container } = render(<Decisions range={30} />);
    const queue = [...container.querySelectorAll('.gr-dec__tier')]
      .find((s) => /Decided/.test(s.querySelector('h3')?.textContent ?? ''))!;
    const cards = [...queue.querySelectorAll('.gr-dec__card')];

    /* The most recent addition is first. */
    expect(cards[0].textContent).toContain('Last thing I decided');
    /* And the one taken before it comes next, not the one taken first. */
    expect(cards[1].textContent).toContain(takeable[1].action);
  });

  it('written and accepted decisions interleave by time, not by kind', () => {
    setChannels([...CHANNEL_KEYS]);
    /* They used to render in two blocks — all accepted, then all written — so a
       decision written between two accepted ones jumped to the bottom. */
    const takeable = ask('What should I do next?', 30).decisions!;
    addFlag('decision', takeable[0].id, takeable[0].action);
    addFlag('decision', ownDecisionId('Middle'), 'Middle');
    addFlag('decision', takeable[1].id, takeable[1].action);

    const { container } = render(<Decisions range={30} />);
    const texts = [...container.querySelectorAll('.gr-dec__card')].map((c) => c.textContent ?? '');
    const iMiddle = texts.findIndex((t) => t.includes('Middle'));
    const iLast = texts.findIndex((t) => t.includes(takeable[1].action));
    const iFirst = texts.findIndex((t) => t.includes(takeable[0].action));
    expect(iLast).toBeLessThan(iMiddle);
    expect(iMiddle).toBeLessThan(iFirst);
  });
});

describe('a taken decision is not offered again', () => {
  it('⭐ a new question returns a FRESH set', () => {
    setChannels([...CHANNEL_KEYS]);
    /* It used to reappear in every later answer wearing "✓ On your queue" —
       truthful and useless. The reader asked a new question and got back a row
       about something they already did, which also read as though the new
       inquiry had acted on its own. */
    const first = ask('What should I do next?', 30).decisions!;
    expect(first.length).toBeGreaterThan(0);
    addFlag('decision', first[0].id, first[0].action);

    const second = ask('What should I do next?', 30).decisions!;
    expect(second.map((d) => d.id)).not.toContain(first[0].id);
  });

  it('and it is still there in the queue, where it is managed', () => {
    setChannels([...CHANNEL_KEYS]);
    const first = ask('What should I do next?', 30).decisions![0];
    addFlag('decision', first.id, first.action);
    render(<Decisions range={30} />);
    /* Not offered is not the same as not recorded. */
    expect(screen.getByText(first.action)).toBeTruthy();
  });
});

describe('⭐ a written decision carries the context it was written under', () => {
  it('shows the same breadcrumb and figures an engine card does', () => {
    setChannels([...CHANNEL_KEYS]);
    /* 🐛 It rendered as a line of text and a Remove button beside engine cards
       carrying a breadcrumb and four figures. I had argued that was correct —
       "there is nothing to check it against."

       That was true of the CLAIM and false of the CONTEXT. A decision written in
       the panel is written ABOUT something, and the numbers on screen at that
       moment are as real as any the engine cites. Throwing them away is what made
       the card look unfinished. */
    const ctx = figuresFor({ kind: 'channel', id: 'meta' }, 30);
    addFlag('decision', ownDecisionId('TEST SSS'), 'TEST SSS', {
      scope: ctx.scope, channel: ctx.channel, evidence: ctx.evidence,
    });

    const { container } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((c) => c.textContent?.includes('TEST SSS'))!;

    expect(card.querySelector('.gr-dec__scope')?.textContent).toMatch(/Meta/);
    expect(card.querySelector('.gr-dec__scope')?.textContent).toMatch(/decided/);
    /* The figures grid, same element the engine cards use. */
    expect(card.querySelectorAll('.gr-dec__evidence dt').length).toBe(ctx.evidence.length);
    expect(card.textContent).toMatch(/CAC/);
  });

  it('⚠️ renders what was CAPTURED, not what is true now', () => {
    setChannels([...CHANNEL_KEYS]);
    /* The figures are what the reader was looking at when they decided. Looking
       them up at render time would quietly restate the decision against numbers
       that have moved since. */
    addFlag('decision', ownDecisionId('Frozen figures'), 'Frozen figures', {
      scope: ['Meta'], channel: 'meta',
      evidence: [{ label: 'CAC', value: '$99.99' }],
    });
    const { container } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((c) => c.textContent?.includes('Frozen figures'))!;
    expect(card.textContent).toContain('$99.99');
  });

  it('a decision written with no subject still renders cleanly', () => {
    setChannels([...CHANNEL_KEYS]);
    /* Context is optional — an older flag, or one written outside the panel,
       must not break the card. */
    addFlag('decision', ownDecisionId('Bare one'), 'Bare one');
    const { container } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((c) => c.textContent?.includes('Bare one'))!;
    expect(card).toBeDefined();
    expect(card.querySelector('.gr-dec__evidence')).toBeNull();
  });
});
