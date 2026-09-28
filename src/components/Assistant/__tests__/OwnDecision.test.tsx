// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Assistant } from '../Assistant';
import { flags, isFlagged, ownDecisionId, removeFlag } from '../../../data/attention';
import { CHANNEL_KEYS } from '../../../data/metrics';
import { setChannels } from '../../../data/channels';

/* jsdom does not implement scrollIntoView, and the panel calls it to keep the
   newest turn in view. A missing DOM method is an environment gap, not a product
   defect — stubbed rather than guarded around in the component, which would put
   test scaffolding into shipping code. */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
});

async function askAndWrite(text: string) {
  setChannels([...CHANNEL_KEYS]);
  const view = render(
    <Assistant open onClose={() => {}} range={30} seed="What should I do next?" />,
  );
  await screen.findByText(/Take any of these|Take it|Decide anyway/);
  fireEvent.click(screen.getByRole('button', { name: /make another decision|decide something/i }));
  fireEvent.change(screen.getByPlaceholderText(/what are you actually going to do/i),
    { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /^add it$/i }));
  return view;
}

describe('a decision you write stays previewed, like one you accept', () => {
  it('⭐ does not vanish on submit', async () => {
    /* 🐛 It used to submit and disappear: the form closed, the decision reached
       the queue, and the panel showed nothing. An engine decision stays put with
       "✓ On your queue" beside it, so a written one vanishing read as the click
       having failed — the two kinds behaved differently at the only moment they
       should have behaved the same. */
    await askAndWrite('Shift budget to affiliates');
    expect(screen.getByText('Shift budget to affiliates')).toBeTruthy();
  });

  it('shows the same "On your queue" state as an accepted finding', async () => {
    await askAndWrite('Rewrite the podcast read');
    const row = screen.getByText('Rewrite the podcast read').closest('.gr-assist__decision')!;
    expect(within(row as HTMLElement).getByText(/On your queue/)).toBeTruthy();
  });

  it('is marked as yours, not as an engine proposal', async () => {
    await askAndWrite('Test a new hook');
    const row = screen.getByText('Test a new hook').closest('.gr-assist__decision')!;
    expect(within(row as HTMLElement).getByText('Yours')).toBeTruthy();
  });

  it('actually reached the queue', async () => {
    await askAndWrite('Pause everything on Fridays');
    expect(isFlagged('decision', ownDecisionId('Pause everything on Fridays'))).toBe(true);
  });

  it('can be undone from the preview, like any other', async () => {
    await askAndWrite('Raise the daily cap');
    const row = screen.getByText('Raise the daily cap').closest('.gr-assist__decision')!;
    fireEvent.click(within(row as HTMLElement).getByRole('button', { name: /On your queue/ }));
    expect(isFlagged('decision', ownDecisionId('Raise the daily cap'))).toBe(false);
    /* Still previewed, now offering to re-take it — G-001: every change reverses. */
    expect(within(row as HTMLElement).getByRole('button', { name: /Make the decision/ })).toBeTruthy();
  });

  it('you can add more than one', async () => {
    await askAndWrite('First call');
    fireEvent.click(screen.getByRole('button', { name: /make another decision/i }));
    fireEvent.change(screen.getByPlaceholderText(/what are you actually going to do/i),
      { target: { value: 'Second call' } });
    fireEvent.click(screen.getByRole('button', { name: /^add it$/i }));
    expect(screen.getByText('First call')).toBeTruthy();
    expect(screen.getByText('Second call')).toBeTruthy();
  });
});
