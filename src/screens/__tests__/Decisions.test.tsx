// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Decisions } from '../Decisions';
import { decisions } from '../../data/decisions';
import { ALL_CHANNELS } from '../../data/blended';
import { CHANNEL_KEYS, setActiveChannels } from '../../data/metrics';
import { setChannels } from '../../data/channels';
import { ask } from '../../data/assistant';
import { dismissals, restore } from '../../data/dismissedDecisions';
import { addFlag, flags, isFlagged, removeFlag } from '../../data/attention';

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
  it('Accept puts it on the attention queue, and Undo takes it off', () => {
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    const card = container.querySelector('.gr-dec__card.is-tier-1') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^accept$/i }));
    expect(within(card).getByText(/On your attention queue/)).toBeTruthy();
    fireEvent.click(within(card).getByRole('button', { name: /^undo$/i }));
    expect(within(card).getByRole('button', { name: /^accept$/i })).toBeTruthy();
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
    expect(within(card as HTMLElement).getByText(/On your attention queue/)).toBeTruthy();
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
