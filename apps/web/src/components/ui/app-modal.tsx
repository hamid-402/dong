"use client";

import {
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useDialogFocusTrap } from "@/lib/use-dialog-focus-trap";

export type AppModalProps = {
  open: boolean;
  ariaLabel: string;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional extra class on the panel (e.g. wider finance forms). */
  panelClassName?: string;
};

/**
 * Shared modal chrome for product surfaces — focus trap, Esc, overlay dismiss,
 * restore focus. Callers own all fields; this never hides capabilities.
 */
export function AppModal({
  open,
  ariaLabel,
  title,
  onClose,
  children,
  panelClassName,
}: AppModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(open, panelRef);

  if (!open) return null;

  function onOverlayClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function onOverlayKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  }

  return (
    <div
      className="appModalOverlay"
      role="presentation"
      onClick={onOverlayClick}
      onKeyDown={onOverlayKeyDown}
    >
      <div
        ref={panelRef}
        className={["appModalPanel", panelClassName].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {title ? <h3 className="appModalTitle">{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}
