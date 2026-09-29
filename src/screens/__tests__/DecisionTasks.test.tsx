// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { Decisions } from '../Decisions';
import { decisions, targetOfDecision } from '../../data/decisions';
import { ALL_CHANNELS } from '../../data/blended';
import { CHANNEL_KEYS } from '../../data/metrics';
import { setChannels } from '../../data/channels';
import {
  addFlag, flags, onAttentionStrip, ownDecisionId, removeFlag, setTask,
} from '../../data/attention';
import { InfoStrip } from '../../components/InfoStrip/InfoStrip';

afterEach(() => {
  cleanup();
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
});

const takeable = () => decisions(30, ALL_CHANNELS).find((c) => c.tier !== 3)!;
const decided = (c: HTMLElement) => c.querySelector('.gr-dec__tier.is-queue') as HTMLElement;

describe('G-008 — a decision gets an owner and a date', () => {
  it('a PROPOSED card has no owner or date; a DECIDED one does', () => {
    setChannels([...CHANNEL_KEYS]);
    const c = takeable();
    const { container, rerender } = render(<Decisions range={30} />);
    /* Nobody owns a proposal -- nobody has agreed to it yet. */
    expect(container.querySelector('.gr-task')).toBeNull();

    addFlag('decision', c.id, c.action);
    rerender(<Decisions range={30} />);
    expect(decided(container).querySelector('.gr-task')).not.toBeNull();
  });

  it('choosing an owner and a date writes them onto the SAME flag', () => {
    setChannels([...CHANNEL_KEYS]);
    const c = takeable();
    addFlag('decision', c.id, c.action);
    const { container } = render(<Decisions range={30} />);
    const q = decided(container);

    fireEvent.change(within(q).getByRole('combobox'), { target: { value: 'jr' } });
    fireEvent.change(q.querySelector('input[type="date"]')!, { target: { value: '2099-01-31' } });

    /* One record, grown fields -- not a second task list beside it. */
    const f = flags().filter((x) => x.kind === 'decision');
    expect(f).toHaveLength(1);
    expect(f[0].owner).toBe('jr');
    expect(f[0].due).toBe('2099-01-31');
  });

  it('a past due date marks the card overdue, in words as well as colour', () => {
    setChannels([...CHANNEL_KEYS]);
    const c = takeable();
    setTask('decision', c.id, c.action, { due: '2020-01-01' });
    const { container } = render(<Decisions range={30} />);
    const card = decided(container).querySelector('.gr-dec__card')!;
    expect(card.className).toMatch(/is-overdue/);
    expect(card.textContent).toMatch(/Overdue — was due/);
  });

  it('a decision you WROTE gets the same fields', () => {
    setChannels([...CHANNEL_KEYS]);
    addFlag('decision', ownDecisionId('Cut podcasts'), 'Cut podcasts');
    const { container } = render(<Decisions range={30} />);
    expect(decided(container).querySelector('.is-own .gr-task')).not.toBeNull();
  });

  it('clearing the owner unassigns without touching the date', () => {
    const c = takeable();
    setTask('decision', c.id, c.action, { owner: 'dk', due: '2099-02-01' });
    setChannels([...CHANNEL_KEYS]);
    const { container } = render(<Decisions range={30} />);
    fireEvent.change(within(decided(container)).getByRole('combobox'), { target: { value: '' } });
    const f = flags().find((x) => x.kind === 'decision')!;
    expect(f.owner).toBeUndefined();
    expect(f.due).toBe('2099-02-01');
  });
});

describe('an overdue decision returns to Needs attention', () => {
  const today = new Date(2026, 8, 28);

  it('only when overdue', () => {
    setTask('decision', 'd1', 'Pause X', { due: '2026-09-30' });
    expect(onAttentionStrip(flags()[0], today)).toBe(false);
    setTask('decision', 'd1', 'Pause X', { due: '2026-09-20' });
    expect(onAttentionStrip(flags()[0], today)).toBe(true);
  });

  it('a decision with no date never does -- taking it WAS attending to it', () => {
    addFlag('decision', 'd2', 'Scale Y');
    expect(onAttentionStrip(flags()[0], today)).toBe(false);
  });

  it('campaign flags are always on it, dated or not', () => {
    addFlag('campaign', 'c1', 'Look at this');
    expect(onAttentionStrip(flags()[0], today)).toBe(true);
  });

  it('an overdue pill has no × -- a late commitment is not cleared from a strip', () => {
    const { container } = render(
      <InfoStrip
        alerts={[
          { id: 'a', label: 'Overdue: Pause X', tone: 'bad', source: 'overdue', dismissable: false },
          { id: 'b', label: 'Meta CAC up', tone: 'warn', source: 'derived' },
        ]}
        onDismiss={() => {}}
      />,
    );
    expect(container.querySelectorAll('.gr-strip__dismiss')).toHaveLength(1);
  });
});

describe('every decision goes back to the item it was decided on', () => {
  it('every card offers "Go to", and it opens THAT card\'s target', () => {
    setChannels([...CHANNEL_KEYS]);
    const opened: unknown[] = [];
    const { container } = render(<Decisions range={30} onOpen={(t) => opened.push(t)} />);
    const cards = [...container.querySelectorAll('.gr-dec__card')] as HTMLElement[];
    const all = decisions(30, ALL_CHANNELS);
    expect(cards).toHaveLength(all.length);
    cards.forEach((card, i) => {
      fireEvent.click(within(card).getByRole('button', { name: /^Go to/ }));
      expect(opened[i]).toEqual(all.find((c) => card.textContent!.includes(c.action))!.target);
    });
  });

  it('an account-wide decision says "Go to all channels"', () => {
    setChannels([...CHANNEL_KEYS]);
    const acct = decisions(30, ALL_CHANNELS).find((c) => c.target.kind === 'account');
    if (!acct) return;
    const { container } = render(<Decisions range={30} onOpen={() => {}} />);
    expect(container.textContent).toMatch(/Go to all channels/);
  });

  it('accepting stores the target ON the flag, so it survives the finding going away', () => {
    setChannels([...CHANNEL_KEYS]);
    const c = takeable();
    const { container } = render(<Decisions range={30} onOpen={() => {}} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((el) => el.textContent!.includes(c.action)) as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^accept$/i }));
    expect(flags().find((f) => f.refId === c.id)?.target).toEqual(c.target);
  });

  it('a WRITTEN decision goes back to what it was written about', () => {
    setChannels([...CHANNEL_KEYS]);
    const target = { kind: 'channel' as const, id: 'meta', label: 'Meta' };
    addFlag('decision', ownDecisionId('Cut Meta'), 'Cut Meta', { target });
    const opened: unknown[] = [];
    const { container } = render(<Decisions range={30} onOpen={(t) => opened.push(t)} />);
    const own = container.querySelector('.is-own') as HTMLElement;
    fireEvent.click(within(own).getByRole('button', { name: 'Go to Meta →' }));
    expect(opened).toEqual([target]);
  });
});

describe('targetOfDecision', () => {
  const cands = () => decisions(30, ALL_CHANNELS);
  it('prefers the stored target, then the live finding, then the captured channel', () => {
    const c = cands()[0];
    const stored = { kind: 'campaign' as const, id: 'c1', label: 'X' };
    expect(targetOfDecision({ refId: c.id, target: stored }, cands())).toEqual(stored);
    expect(targetOfDecision({ refId: c.id }, cands())).toEqual(c.target);
    expect(targetOfDecision({ refId: 'gone', channel: 'tiktok' }, cands()))
      .toEqual({ kind: 'channel', id: 'tiktok', label: 'TikTok' });
    /* Nothing recoverable: no link, rather than a link to the wrong place. */
    expect(targetOfDecision({ refId: 'gone' }, cands())).toBeUndefined();
  });
});

describe('grading on the Decided queue', () => {
  it('⭐ a decision stays after its finding goes away -- and reads Done', async () => {
    const { setStage } = await import('../../data/campaignStatus');
    const { CAMPAIGNS } = await import('../../data/campaigns');
    setChannels([...CHANNEL_KEYS]);
    const review = decisions(30, ALL_CHANNELS).find((c) => c.kind === 'stale-review')!;
    const { container, rerender } = render(<Decisions range={30} />);
    const card = [...container.querySelectorAll('.gr-dec__card')]
      .find((el) => el.textContent!.includes(review.action)) as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: /^accept$/i }));
    expect(decided(container).textContent).toMatch(/Not yet/);

    /* Approve the campaign. The engine stops proposing "decide on it"... */
    setStage(review.target.id, 'Active');
    rerender(<Decisions range={30} />);
    expect(decisions(30, ALL_CHANNELS).some((c) => c.id === review.id)).toBe(false);
    /* ...and the decision is still there, graded. */
    expect(decided(container).textContent).toContain(review.action);
    expect(decided(container).querySelector('.gr-score')!.getAttribute('data-status')).toBe('done');
    expect(decided(container).textContent).toMatch(/Track record: 1 worked/);
    setStage(review.target.id, CAMPAIGNS.find((c) => c.id === review.target.id)!.stage);
  });

  it('a written decision is graded by hand', () => {
    setChannels([...CHANNEL_KEYS]);
    addFlag('decision', ownDecisionId('Pause podcasts for a week'), 'Pause podcasts for a week');
    const { container } = render(<Decisions range={30} />);
    fireEvent.click(within(decided(container)).getByRole('button', { name: 'Worked' }));
    expect(flags().find((f) => f.label === 'Pause podcasts for a week')!.outcome).toBe('worked');
    expect(decided(container).textContent).toMatch(/Track record: 1 worked/);
  });
});
