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

  useEffect(() => {
    if (!open) return;
    /* Captured on open, before focus moves anywhere inside. */
    restoreTo.current = document.activeElement as HTMLElement | null;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); return; }
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
    return () => {
      document.removeEventListener('keydown', onKey);
      /* Only if focus is still inside or already lost. If the user has
         deliberately clicked something else on the way out, yanking them back
         is its own bug. */
      const active = document.activeElement;
      const inside = ref.current?.contains(active as Node);
      if (inside || active === document.body || active === null) {
        restoreTo.current?.focus?.();
      }
    };
  }, [open, ref, onClose, trap]);
}
