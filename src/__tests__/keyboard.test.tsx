// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useOverlay } from '../data/useOverlay';
import { MetricToggle } from '../components/MetricToggle/MetricToggle';
import { RangePicker } from '../components/RangePicker/RangePicker';
import type { Metric, Range } from '../data/metrics';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0; });
});
afterEach(cleanup);

/* A panel opened by a button, with the parent re-rendering while it is open --
   exactly the shape that broke: App passes onClose inline, so every render
   hands the hook a new function. */
function Harness() {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(open, ref, () => setOpen(false));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <button type="button" onClick={() => setTick((t) => t + 1)}>Rerender</button>
      {open && (
        <div ref={ref} role="dialog">
          <input aria-label="inside" autoFocus />
          <button type="button" onClick={() => setTick((t) => t + 1)}>Poke</button>
        </div>
      )}
    </>
  );
}

describe('overlays give focus back to what opened them', () => {
  it('🐛 Escape restores focus to the opener even after the parent re-rendered', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    /* Re-render while open, with focus inside -- this is what used to overwrite
       the saved return point with the input. */
    fireEvent.click(screen.getByRole('button', { name: 'Poke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Poke' }));
    screen.getByLabelText('inside').focus();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('menus give focus back after a SELECTION, not only after Escape', () => {
  it('picking a range returns focus to the trigger', () => {
    function R() {
      const [v, setV] = useState<Range>(30);
      return <RangePicker value={v} onChange={setV} />;
    }
    render(<R />);
    const trigger = screen.getByRole('button', { name: /Last 30 days/ });
    trigger.focus();
    fireEvent.click(trigger);
    const option = screen.getByRole('option', { name: /Last 7 days/ });
    option.focus();
    fireEvent.click(option);
    expect(screen.queryByRole('option')).toBeNull();
    expect(document.activeElement?.textContent).toMatch(/Last 7 days/);
  });
});

describe('the metric tabs follow the ARIA tabs pattern', () => {
  function T() {
    const [m, setM] = useState<Metric>('Spend');
    return <MetricToggle value={m} onChange={setM} />;
  }
  it('is ONE Tab stop: only the selected tab is tabbable', () => {
    render(<T />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(tabs.find((t) => t.tabIndex === 0)!.textContent).toBe('Spend');
  });
  it('arrows move and select; Home and End jump; it wraps', () => {
    render(<T />);
    const list = screen.getByRole('tablist');
    const selected = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')!.textContent;
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(selected()).toBe('Clicks');
    expect(document.activeElement?.textContent).toBe('Clicks');
    fireEvent.keyDown(list, { key: 'End' });
    expect(selected()).toBe('ROAS');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(selected()).toBe('Spend');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(selected()).toBe('ROAS');
  });
});
