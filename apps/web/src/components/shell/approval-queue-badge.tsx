"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { api } from "@/lib/api";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { slugFromPathname } from "@/lib/workspace-storage";
import { wPath } from "@/lib/workspace-paths";
import { t } from "@/lib/i18n";

const REFRESH_MS = 60_000;

/**
 * Header shortcut to Approvals — only renders when the product flag is on
 * and the live queue has at least one item (no zero badge).
 * Uses lightweight /approval-queue/count, not the full item list.
 */
export function ApprovalQueueBadge({ workspaceId }: { workspaceId?: string }) {
  const chrome = useOptionalAppChrome();
  const pathname = usePathname();
  const enabled = Boolean(chrome?.capabilities?.productFlags?.approvalQueue);
  const effectiveWorkspaceId = workspaceId ?? chrome?.workspaceId ?? "";
  const slug =
    slugFromPathname(pathname) ??
    chrome?.workspaces.find((w) => w.id === effectiveWorkspaceId)?.slug ??
    null;
  const [count, setCount] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // Server pushes when an expense lands or is reversed — refresh right then;
  // the interval below stays as the fallback when SSE is unavailable.
  useLiveInvalidation(["expenses"], () => setTick((n) => n + 1));

  useEffect(() => {
    if (!enabled || !effectiveWorkspaceId) {
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
    const timer = window.setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, effectiveWorkspaceId, pathname, tick]);

  if (!enabled || !slug || count == null || count <= 0) return null;

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
