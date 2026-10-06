"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Focus trap + restore for modal dialogs. Escape is left to the caller
 * when a shared overlay already handles it.
 */
export function useDialogFocusTrap(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  options?: {
    initialFocusRef?: RefObject<HTMLElement | null>;
  },
): void {
  const initialFocusRef = options?.initialFocusRef;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusInitial = () => {
      const preferred = initialFocusRef?.current;
      if (preferred && panel.contains(preferred)) {
        preferred.focus();
        return;
      }
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    };
    const t = window.setTimeout(focusInitial, 0);

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, panelRef, initialFocusRef]);
}
