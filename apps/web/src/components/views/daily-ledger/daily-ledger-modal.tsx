"use client";

import { useEffect, type ReactNode } from "react";
import { AppModal } from "@/components/ui/app-modal";

type DailyLedgerModalProps = {
  open: boolean;
  ariaLabel: string;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** Forwarded to AppModal panel (e.g. mobile max-height classes in run 29). */
  panelClassName?: string;
};

/**
 * run29b: scoped touch targets inside ledger modals only.
 * Raises min size of focusable controls under `.dang-modal` to ≥44px without
 * editing shared UI CSS (components.css / shell / globals).
 */
const LEDGER_MODAL_TOUCH_STYLE = `
.dang-modal button,
.dang-modal a[href],
.dang-modal input:not([type="hidden"]),
.dang-modal select,
.dang-modal textarea,
.dang-modal summary,
.dang-modal [role="button"],
.dang-modal [role="option"],
.dang-modal [role="menuitem"],
.dang-modal [role="tab"],
.dang-modal [tabindex]:not([tabindex="-1"]) {
  min-height: 44px;
  min-width: 44px;
  box-sizing: border-box;
}
`;

/**
 * While the ledger modal is open, mark ancestor-sibling subtrees as inert so
 * page chrome under the overlay (e.g. day-view crumb) is not exposed to a11y /
 * axe target-size as partially obscured controls. Controls inside the modal
 * stay active. Nothing is removed, hidden via display, or disabled.
 */
function useInertBackgroundWhileOpen(open: boolean) {
  useEffect(() => {
    if (!open) return;

    const marked: HTMLElement[] = [];
    const apply = () => {
      const modal = document.querySelector(".dang-modal");
      if (!(modal instanceof HTMLElement)) return;
      let el: HTMLElement | null = modal;
      while (el && el !== document.body) {
        const parentEl: HTMLElement | null = el.parentElement;
        if (!parentEl) break;
        for (const child of Array.from(parentEl.children)) {
          if (
            child !== el &&
            child instanceof HTMLElement &&
            child.tagName !== "STYLE" &&
            !child.hasAttribute("inert")
          ) {
            child.setAttribute("inert", "");
            marked.push(child);
          }
        }
        el = parentEl;
      }
    };

    // Modal mounts in the same commit; defer one frame so .dang-modal exists.
    const raf = window.requestAnimationFrame(apply);
    return () => {
      window.cancelAnimationFrame(raf);
      for (const node of marked) {
        node.removeAttribute("inert");
      }
    };
  }, [open]);
}

/** Ledger-facing alias of AppModal — same behavior, stable import path. */
export function DailyLedgerModal({
  open,
  ariaLabel,
  title,
  onClose,
  children,
  panelClassName,
}: DailyLedgerModalProps) {
  useInertBackgroundWhileOpen(open);

  return (
    <>
      <style data-testid="daily-ledger-modal-touch-style">{LEDGER_MODAL_TOUCH_STYLE}</style>
      <AppModal
        open={open}
        ariaLabel={ariaLabel}
        title={title}
        onClose={onClose}
        panelClassName={panelClassName}
      >
        {children}
      </AppModal>
    </>
  );
}
