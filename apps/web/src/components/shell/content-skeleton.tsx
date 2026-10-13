"use client";

import { Skeleton } from "@dang/ui";
import { t } from "@/lib/i18n";

/** Content-shaped loading skeleton — beyond route-level RouteLoadingHint / EmptyHint.loading. */
export function ContentSkeleton({
  rows = 3,
  label,
}: {
  rows?: number;
  label?: string;
}) {
  const resolvedLabel = label ?? t("shell.loading");
  const count = Math.max(1, Math.min(rows, 8));
  return (
    <div
      className="contentSkeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="visually-hidden">{resolvedLabel}</span>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="contentSkeleton__block" aria-hidden>
          <Skeleton className="contentSkeleton__line" height="0.75rem" />
          <Skeleton className="contentSkeleton__line contentSkeleton__line--short" height="0.75rem" width="42%" />
          <Skeleton className="contentSkeleton__line contentSkeleton__line--mid" height="0.75rem" width="68%" />
        </div>
      ))}
    </div>
  );
}
