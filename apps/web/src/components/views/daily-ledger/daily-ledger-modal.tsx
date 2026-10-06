"use client";

import type { ReactNode } from "react";
import { AppModal } from "@/components/ui/app-modal";

type DailyLedgerModalProps = {
  open: boolean;
  ariaLabel: string;
  title?: string;
  onClose: () => void;
  children: ReactNode;
};

/** Ledger-facing alias of AppModal — same behavior, stable import path. */
export function DailyLedgerModal({
  open,
  ariaLabel,
  title,
  onClose,
  children,
}: DailyLedgerModalProps) {
  return (
    <AppModal open={open} ariaLabel={ariaLabel} title={title} onClose={onClose}>
      {children}
    </AppModal>
  );
}
