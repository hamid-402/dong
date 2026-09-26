"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isExpenseApproverRole } from "@dang/contracts";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { api } from "@/lib/api";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import { slugFromPathname } from "@/lib/workspace-storage";
import { wPath } from "@/lib/workspace-paths";
import { t } from "@/lib/i18n";

const REFRESH_MS = 60_000;

/**
 * Header shortcut to Approvals — only renders when the product flag is on,
 * the actor is an expense-approver role, and the live queue has ≥1 item
 * (no zero badge / no 403 tease).
 */
export function ApprovalQueueBadge({ workspaceId }: { workspaceId?: string }) {
  const chrome = useOptionalAppChrome();
  const pathname = usePathname();
  const enabled = Boolean(chrome?.capabilities?.productFlags?.approvalQueue);
  const effectiveWorkspaceId = workspaceId ?? chrome?.workspaceId ?? "";
  const { role } = useWorkspaceMembershipRole(effectiveWorkspaceId);
  const canAct = isExpenseApproverRole(role);
  const slug =
    slugFromPathname(pathname) ??
    chrome?.workspaces.find((w) => w.id === effectiveWorkspaceId)?.slug ??
    null;
  const [count, setCount] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const sseOpen = chrome?.sseStatus === "open";

  useLiveInvalidation(
    ["expenses", "settlements", "balances", "invoices:"],
    () => setTick((n) => n + 1),
  );

  useEffect(() => {
    if (!enabled || !canAct || !effectiveWorkspaceId) {
      setCount(null);
      return;
    }
    let cancelled = false;

    async function refresh() {
      try {
        const res = await api.approvalQueueCount(effectiveWorkspaceId);
        if (!cancelled) setCount(res.count);
      } catch {
        if (!cancelled) setCount(null);
      }
    }

    void refresh();
    if (sseOpen) {
      return () => {
        cancelled = true;
      };
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, canAct, effectiveWorkspaceId, pathname, tick, sseOpen]);

  if (!enabled || !canAct || !slug || count == null || count <= 0) return null;

  const label = t("shell.approvalBadge", { count });
  return (
    <Link
      href={wPath(slug, "approvals")}
      className="shell-v2__approval-badge"
      title={t("shell.approvalBadgeTitle")}
      aria-label={label}
    >
      <ShellIconSvg name="receipt" />
      <span className="shell-v2__approval-badge-count" aria-hidden>
        {new Intl.NumberFormat("fa-IR").format(count)}
      </span>
    </Link>
  );
}
