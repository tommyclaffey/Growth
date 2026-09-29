// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from '../App';
import { notifyAssignment } from '../data/teamMessages';
import { allConversations, getConversation, resetConversations } from '../data/conversations';
import { ME } from '../data/chat';
import { CHANNEL_KEYS } from '../data/metrics';
import { setChannels } from '../data/channels';
import { flags, removeFlag } from '../data/attention';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia ??= ((q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
});
afterEach(() => {
  cleanup();
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  resetConversations();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('decisions reach people', () => {
  it('assigning a decision tells the owner, in their DMs, with the decision attached', () => {
    const id = notifyAssignment('jr', { refId: 'x', label: 'Pause the weak ad', due: '2026-10-02' })!;
    const c = getConversation(id)!;
    expect(c.memberIds.sort()).toEqual([ME.id, 'jr'].sort());
    const last = c.messages[c.messages.length - 1];
    expect(last.body).toMatch(/assigned you a decision, due Oct 2/);
    expect(last.decision?.label).toBe('Pause the weak ad');
    expect(last.decision?.owner).toBe('jr');
  });

  it('assigning to yourself sends nothing -- you already know', () => {
    const before = allConversations().length;
    expect(notifyAssignment(ME.id, { refId: 'x', label: 'y' })).toBeUndefined();
    expect(allConversations().length).toBe(before);
  });

  it('⭐ Share stages the decision in chat; Send puts it in the conversation', async () => {
    setChannels([...CHANNEL_KEYS]);
    window.history.replaceState(null, '', '/?v=decisions');
    const { container } = render(<App />);
    const first = container.querySelector('.gr-dec__card') as HTMLElement;
    const action = first.querySelector('.gr-dec__action')!.textContent!;
    fireEvent.click(within(first).getByRole('button', { name: 'Share' }));

    const chat = await waitFor(() => container.querySelector('.gr-chat') as HTMLElement);
    /* Open a conversation, then the staged decision rides the next message. */
    const convButton = await waitFor(() => within(chat).getAllByRole('button')
      .find((b) => /growth-analytics/.test(b.textContent ?? ''))!);
    fireEvent.click(convButton);
    await waitFor(() => expect(chat.querySelector('.gr-chat__attachment .gr-chat__decision')).not.toBeNull());
    fireEvent.click(within(chat).getByRole('button', { name: 'Send' }));

    const sent = allConversations().flatMap((c) => c.messages).find((m) => m.decision?.label === action);
    expect(sent?.body).toBe('Sharing this decision.');
    expect(screen.getAllByText(action).length).toBeGreaterThan(0);
  });
});
