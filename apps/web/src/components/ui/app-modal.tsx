"use client";

import type { ReactNode } from "react";
import { Modal } from "@dang/ui";

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
 * Product modal. Chrome, focus trap, and Escape live on Modal in @dang/ui.
 */
export function AppModal({
  open,
  ariaLabel,
  title,
  onClose,
  children,
  panelClassName,
}: AppModalProps) {
  return (
    <Modal
      open={open}
      title={title ?? ariaLabel}
      titleVisible={Boolean(title)}
      onClose={onClose}
      className={panelClassName}
    >
      {children}
    </Modal>
  );
}
