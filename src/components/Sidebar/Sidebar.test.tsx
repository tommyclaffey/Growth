// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, screen, within } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { useNavCounts } from '../../data/navCounts';
import { decisions } from '../../data/decisions';
import { notifications } from '../../data/notifications';
import { decisionEvents } from '../../data/decisionEvents';
import { addFlag, flags, removeFlag } from '../../data/attention';
import { CHANNEL_KEYS } from '../../data/metrics';

afterEach(() => {
  cleanup();
  for (const f of [...flags()]) removeFlag(f.kind, f.refId);
  localStorage.clear();
});

describe('the sidebar (Sept 30)', () => {
  it('two labelled sections -- Analyze, then Act -- and Settings at the foot', () => {
    render(<Sidebar active="overview" onNavigate={vi.fn()} />);
    const analyze = screen.getByRole('list', { name: 'Analyze' });
    const act = screen.getByRole('list', { name: 'Act' });
    expect(within(analyze).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Overview', 'Channels', 'Campaigns', 'Ads']);
    expect(within(act).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['Decisions', 'Reports', 'Notifications']);
    /* Settings is in neither section -- it sits with the account. */
    expect(within(analyze).queryByText('Settings')).toBeNull();
    expect(within(act).queryByText('Settings')).toBeNull();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('a count shows what is waiting; zero shows nothing', () => {
    render(<Sidebar active="overview" onNavigate={vi.fn()} counts={{ decisions: 4, notifications: 0 }} />);
    expect(screen.getByRole('button', { name: 'Decisions, 4 waiting' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  });

  it('⭐ the counts are the screens’ own numbers -- a badge cannot disagree with its page', () => {
    const ch = [...CHANNEL_KEYS];
    const { result, rerender } = renderHook(() => useNavCounts(30, ch));
    const waiting = decisions(30, ch).filter((c) => c.tier !== 3);
    expect(result.current.decisions).toBe(waiting.length);
    expect(result.current.notifications).toBe([...decisionEvents(), ...notifications(ch)].length);
    /* Taking one takes it off the count. */
    addFlag('decision', waiting[0].id, waiting[0].action);
    rerender();
    expect(result.current.decisions).toBe(waiting.length - 1);
  });
});
