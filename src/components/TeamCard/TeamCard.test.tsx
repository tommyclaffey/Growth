// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamCard } from './TeamCard';

describe('TeamCard', () => {
  it('shows the whole demo team, you first, each with a photo and a job', () => {
    render(<TeamCard />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items[0].textContent).toContain('Maya Okonkwo (you)');
    expect(items[0].textContent).toContain('Growth lead');
    for (const name of ['Jess Ramírez', 'Dan Kwon', 'Amara Price', 'Leo Hartmann', 'Priya Nair']) {
      expect(screen.getByRole('img', { name }).getAttribute('src')).toBeTruthy();
    }
    expect(screen.getByText('Paid social manager')).toBeTruthy();
  });
});
