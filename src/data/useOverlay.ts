import { useEffect, useRef } from 'react';

/**
 * Focus behaviour for anything that opens over the page.
 *
 * Written once because three components needed the same three things and had
 * between zero and one of them each. The Assistant declared `aria-modal` while
 * Tab walked straight out into the dashboard behind it -- a claim of
 * containment the DOM did not honour. The chat panel had no Escape at all and,
 * on close, unmounted its own subtree so focus fell to <body>, which sends a
 * keyboard user back to the top of the document.
 *
 * Three guarantees:
 *
 *   TRAP     Tab and Shift+Tab cycle inside the overlay. Without it
 *            `aria-modal` is a lie, and a screen reader user is told they are
 *            in a dialog while their focus is somewhere else entirely.
 *
 *   RESTORE  Focus returns to whatever opened it. Dropping focus to <body> is
 *            the single most common way a keyboard user loses their place.
 *
 *   ESCAPE   Optional, because a non-modal panel may want its own handling.
 */
export function useOverlay(
  open: boolean,
  ref: React.RefObject<HTMLElement | null>,
  onClose?: () => void,
  /**
   * Trap Tab inside the overlay. TRUE only for modals.
   *
   * A side panel is not modal -- the dashboard behind it stays usable, and
   * trapping focus there would strand a keyboard user inside a panel they
   * never asked to be confined to. Escape and restore still apply; only the
   * trap is conditional. Getting this wrong in the other direction is what
   * makes aria-modal a lie, so it is a parameter rather than a default.
   */
  trap = true,
) {
  const restoreTo = useRef<HTMLElement | null>(null);

  /* 🐛 onClose lives in a ref, NOT in the effect's dependencies.

     Callers pass it inline -- `onClose={() => setAssistOpen(false)}` -- so it
     is a new function every render, and as a dependency it re-ran this effect
     on EVERY render. Each re-run re-captured `restoreTo` from
     document.activeElement, which by then was the textarea INSIDE the panel.
     On close, focus was "restored" to an element that had just been
     unmounted, and landed on <body>. The restore guarantee existed in the
     code and never once worked. Measured Sept 28 by tabbing through the real
     page: Escape from the assistant dropped focus to the top of the document. */
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  /* 🐛 Captured during the RENDER in which `open` flips false -> true -- the
     last moment before anything inside the overlay exists. Every later point
     was too late for some caller: a useEffect ran after the Assistant had
     already focused its textarea; a layout effect runs after `autoFocus`,
     which React applies while committing the children. Only the render that
     opens it still sees the opener as document.activeElement. Reading focus
     is side-effect-free, and the ref is written once per opening. */
  const wasOpen = useRef(false);
  // eslint-disable-next-line react-hooks/refs
  if (open && !wasOpen.current) restoreTo.current = document.activeElement as HTMLElement | null;
  // eslint-disable-next-line react-hooks/refs
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && closeRef.current) { e.stopPropagation(); closeRef.current(); return; }
      if (!trap || e.key !== 'Tab') return;

      const root = ref.current;
      if (!root) return;
      /* Queried per keypress, not cached: the list changes as suggestions
         appear, buttons enable, and messages arrive. A snapshot taken on open
         would send Tab to elements that no longer exist. */
      const items = Array.from(root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;

      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault(); first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    const panel = ref;
    return () => {
      document.removeEventListener('keydown', onKey);
      /* Only if focus is still inside or already lost. If the user has
         deliberately clicked something else on the way out, yanking them back
         is its own bug. */
      const active = document.activeElement;
      const inside = panel.current?.contains(active as Node);
      if (inside || active === document.body || active === null) {
        restoreTo.current?.focus?.();
      }
    };
  }, [open, ref, trap]);
}
