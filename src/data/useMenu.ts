import { useEffect, useRef } from 'react';

/**
 * Dropdown behaviour, written once for the three menus that had it three ways.
 *
 * ChannelSwitcher, RangePicker and StatusMenu each declared role="listbox"
 * with role="option" children and then implemented none of the keyboard
 * behaviour that names promise: no arrow keys, no Home/End, no roving focus.
 * A screen reader announced a listbox that did not behave like one, and a
 * keyboard user could open a menu and then only Tab through it.
 *
 * All three also dropped focus on Escape -- setOpen(false) unmounts the menu,
 * so if focus was on an option it fell to <body>. Closing a menu should put
 * you back on the control you opened it from, every time.
 *
 * Options are queried from the DOM per keypress rather than tracked in state,
 * because the caller already renders them and a second list would be a second
 * source of truth for the same set.
 */
export function useMenu(
  open: boolean,
  setOpen: (v: boolean) => void,
  wrap: React.RefObject<HTMLElement | null>,
) {
  /* Captured when the menu opens, so Escape and selection can both return
     here. Reading document.activeElement at CLOSE time is too late — focus is
     already inside the menu, or gone with it. */
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    trigger.current = wrap.current?.querySelector<HTMLElement>('button') ?? null;

    const options = () => Array.from(
      wrap.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [],
    );

    function close(restore: boolean) {
      setOpen(false);
      if (restore) trigger.current?.focus();
    }

    function onDown(e: MouseEvent) {
      /* A click outside is a deliberate move elsewhere, so focus is NOT
         restored — yanking it back would fight the user's own click. */
      if (wrap.current && !wrap.current.contains(e.target as Node)) close(false);
    }

    function onKey(e: KeyboardEvent) {
      if (!wrap.current) return;
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }

      const items = options();
      if (items.length === 0) return;
      const i = items.indexOf(document.activeElement as HTMLElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          items[i < 0 ? 0 : (i + 1) % items.length].focus();
          break;
        case 'ArrowUp':
          e.preventDefault();
          items[i <= 0 ? items.length - 1 : i - 1].focus();
          break;
        case 'Home': e.preventDefault(); items[0].focus(); break;
        case 'End': e.preventDefault(); items[items.length - 1].focus(); break;
        case 'Tab':
          /* Tabbing away from a menu closes it. Leaving it open behind you is
             how a menu ends up floating over an unrelated part of the page. */
          close(false);
          break;
        default: break;
      }
    }

    /* Focus the selected option, or the first, so ArrowDown has a starting
       point and a screen reader announces where it is. */
    const items = options();
    (items.find((el) => el.getAttribute('aria-selected') === 'true') ?? items[0])?.focus();

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen, wrap]);
}
