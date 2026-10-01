// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react';
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
  it('one list, in the original order, Settings included', () => {
    render(<Sidebar active="overview" onNavigate={vi.fn()} />);
    const items = within(screen.getByRole('list')).getAllByRole('button').map((b) => b.textContent);
    expect(items).toEqual(['Overview', 'Channels', 'Campaigns', 'Ads', 'Decisions', 'Reports', 'Notifications', 'Settings']);
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

  it('🐛 approving a campaign moves the badge too -- not only the screen', async () => {
    const { setStage } = await import('../../data/campaignStatus');
    const ch = [...CHANNEL_KEYS];
    const { result } = renderHook(() => useNavCounts(30, ch));
    const before = result.current.decisions;
    /* "End Non-brand" is a waiting proposal; activating it removes that card. */
    act(() => setStage('c8', 'Active'));
    try {
      expect(result.current.decisions).toBe(decisions(30, ch).filter((c) => c.tier !== 3).length);
      expect(result.current.decisions).not.toBe(before);
    } finally { act(() => setStage('c8', 'Review')); }
  });
});
