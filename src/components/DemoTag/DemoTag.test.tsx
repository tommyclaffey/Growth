// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { DemoTag } from './DemoTag';
import { refreshAuth } from '../../data/auth';

const me = (user: object | null) => vi.fn(async () => new Response(JSON.stringify({
  user, providers: {}, firstRun: false, canCreateOwner: false,
}), { status: 200 }));
const base = { id: 'x', seat: 'x', name: 'X', email: 'x@x.com', role: 'member' };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DemoTag', () => {
  it('shows on the demo account', async () => {
    vi.stubGlobal('fetch', me({ ...base, demo: true, sandboxed: true }));
    await act(async () => { await refreshAuth(true); });
    render(<DemoTag />);
    expect(screen.getByText('Demo').getAttribute('title')).toMatch(/Sample company/);
  });

  it('shows on the static public demo (no server)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no server'); }));
    await act(async () => { await refreshAuth(true); });
    render(<DemoTag />);
    expect(screen.getByText('Demo')).toBeTruthy();
  });

  it('🛑 never on a real account', async () => {
    vi.stubGlobal('fetch', me({ ...base, role: 'owner' }));
    await act(async () => { await refreshAuth(true); });
    render(<DemoTag />);
    expect(screen.queryByText('Demo')).toBeNull();
  });
});
