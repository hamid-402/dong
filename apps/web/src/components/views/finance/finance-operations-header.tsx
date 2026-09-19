"use client";

import type { ShellIcon } from "@/components/shell/shell-icons";

export type FinanceOperationMetric = {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "attention";
};

export type FinanceOperationDestination = {
  key: string;
  label: string;
  href: string;
  active: boolean;
  icon?: ShellIcon;
  hint?: string;
};

/**
 * Retired sibling-family ops strip (tabs + metrics + refresh).
 * Kept as a no-op so call sites compile; navigation lives in shell / page primary CTA.
 */
export function OperationsModuleHeader(_props: {
  metrics: FinanceOperationMetric[];
  destinations: FinanceOperationDestination[];
  roleLabel: string | null;
  persistenceLabel: string;
  pending: boolean;
  onRefresh: () => void;
  ariaLabel?: string;
  density?: "default" | "compact";
  allowShellPrimaryDestinations?: boolean;
}) {
  return null;
}

export const FinanceOperationsHeader = OperationsModuleHeader;
