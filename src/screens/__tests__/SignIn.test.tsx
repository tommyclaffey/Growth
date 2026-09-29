// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SignIn } from '../SignIn';
import { adoptMe, ME, MEMBERS } from '../../data/chat';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const none = { google: false, slack: false, microsoft: false, teams: false };
const all = { google: true, slack: true, microsoft: true, teams: true };

describe('the sign-in screen', () => {
  it('shows all five ways in when each is set up', () => {
    render(<SignIn providers={all} firstRun={false} canCreateOwner={false} />);
    for (const l of ['Continue with Google', 'Continue with Slack', 'Continue with Microsoft', 'Continue with Microsoft Teams']) {
      expect(screen.getByRole('button', { name: l })).toBeTruthy();
    }
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });

  it('a provider that is not set up is not shown -- no dead buttons; email always is', () => {
    render(<SignIn providers={{ ...none, slack: true }} firstRun={false} canCreateOwner={false} />);
    expect(screen.queryByRole('button', { name: /Google/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue with Slack' })).toBeTruthy();
    cleanup();
    render(<SignIn providers={none} firstRun={false} canCreateOwner={false} />);
    expect(screen.queryByText('or use email')).toBeNull();
  });

  it('first run on this machine: creates the OWNER; through the tunnel: says it cannot', () => {
    render(<SignIn providers={none} firstRun canCreateOwner />);
    expect(screen.getByRole('button', { name: 'Create owner account' })).toBeTruthy();
    cleanup();
    render(<SignIn providers={none} firstRun canCreateOwner={false} />);
    expect(screen.getByText('Growth isn’t set up yet')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
  });

  it('a refused sign-in says why', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'That email and password do not match.' }), { status: 401 }))));
    render(<SignIn providers={none} firstRun={false} canCreateOwner={false} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/do not match/));
  });
});

describe('the signed-in person takes the "me" seat', () => {
  it('a member gets their own seat; the demo’s Maya stays a separate person, with her own face', () => {
    const photo = ME.avatar;
    adoptMe({ seat: 'u_jess', name: 'Jess Ramírez-Real', role: 'member' });
    expect(ME.id).toBe('u_jess');
    expect(ME.initials).toBe('JR');
    expect(ME.avatar).toBeUndefined();                 // never Maya's photo on someone else
    expect(MEMBERS.u_jess).toBe(ME);
    expect(MEMBERS.maya.name).toBe('Maya Okonkwo');
    expect(MEMBERS.maya.avatar).toBe(photo);
  });
});
