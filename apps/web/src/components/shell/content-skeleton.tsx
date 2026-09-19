"use client";

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
          <span className="contentSkeleton__line" />
          <span className="contentSkeleton__line contentSkeleton__line--short" />
          <span className="contentSkeleton__line contentSkeleton__line--mid" />
        </div>
      ))}
    </div>
  );
}
