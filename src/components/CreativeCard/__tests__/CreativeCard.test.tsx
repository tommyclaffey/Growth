// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CreativeCard } from '../CreativeCard';
import { CreativeSection } from '../CreativeSection';
import { creativesFor } from '../../../data/creative';

afterEach(cleanup);

const ad = () => creativesFor('c1')[0];

/**
 * The prop chain from App to this card is four links long, and a link went
 * missing TWICE -- both times a string-replace edit that silently did not
 * match. Both times tsc and the whole suite stayed green, because a card that
 * renders without a handler is a perfectly valid card.
 *
 * These assert the behaviour end of the chain, so a broken link fails here
 * instead of being found by clicking.
 */
describe('CreativeCard opening', () => {
  it('is a real button, and fires with its own id', () => {
    const onOpen = vi.fn();
    render(<CreativeCard creative={ad()} channel="meta" onOpen={onOpen} />);
    const btn = screen.getByRole('button', { name: /Open ad/ });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledWith(ad().id);
  });

  it('is NOT a button when it cannot navigate', () => {
    const { container } = render(<CreativeCard creative={ad()} channel="meta" />);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('article')).toBeTruthy();
  });

  it('passes the handler all the way through the section', () => {
    /* The link that broke. The section renders the cards, so if it forgets to
       forward onOpen, nothing below it can work. */
    const onOpen = vi.fn();
    render(<CreativeSection channel="meta" creatives={creativesFor('c1')} onOpenAd={onOpen} />);
    fireEvent.click(screen.getAllByRole('button', { name: /Open ad/ })[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen.mock.calls[0][0]).toMatch(/^c1/);
  });

  it('renders no ad buttons when the section is given no handler', () => {
    render(<CreativeSection channel="meta" creatives={creativesFor('c1')} />);
    expect(screen.queryAllByRole('button', { name: /Open ad/ })).toHaveLength(0);
  });
});
