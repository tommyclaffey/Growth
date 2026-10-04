// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BottomNav } from './BottomNav';
import { NAV } from '../Sidebar/nav';

afterEach(cleanup);

describe('the phone tab bar (Oct 4)', () => {
  it('four tabs and More, in the check-in order', () => {
    render(<BottomNav active="overview" onNavigate={vi.fn()} />);
    const tabs = within(screen.getByRole('navigation', { name: 'Main' })).getAllByRole('button').map((b) => b.textContent);
    expect(tabs).toEqual(['Overview', 'Decisions', 'Campaigns', 'Notifications', 'More']);
  });

  it('every screen is reachable: the tabs plus More cover the whole nav', () => {
    const onNavigate = vi.fn();
    render(<BottomNav active="overview" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const sheet = screen.getByRole('dialog', { name: 'More' });
    const reachable = [
      ...within(screen.getByRole('navigation')).getAllByRole('button').map((b) => b.textContent),
      ...within(sheet).getAllByRole('button').map((b) => b.textContent),
    ];
    for (const n of NAV) expect(reachable, n.label).toContain(n.label);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reports' }));
    expect(onNavigate).toHaveBeenCalledWith('reports');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the active tab is marked, and More is active for a screen it holds', () => {
    const { rerender } = render(<BottomNav active="decisions" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Decisions' }).getAttribute('aria-current')).toBe('page');
    rerender(<BottomNav active="settings" onNavigate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'More' }).className).toMatch(/is-active/);
  });

  it('counts are spoken, not just drawn', () => {
    render(<BottomNav active="overview" onNavigate={vi.fn()} counts={{ decisions: 11, notifications: 5 }} />);
    expect(screen.getByRole('button', { name: 'Decisions, 11 waiting' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Notifications, 5 waiting' })).toBeTruthy();
  });

  it('More holds Team chat and Export, and Escape closes it', () => {
    const onTeam = vi.fn();
    render(<BottomNav active="overview" onNavigate={vi.fn()} onTeam={onTeam} onExport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Team chat' }));
    expect(onTeam).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
