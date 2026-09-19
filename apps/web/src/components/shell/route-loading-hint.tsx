"use client";

import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { t } from "@/lib/i18n";

/** Shared route-level loading affordance for dynamic workspace pages. */
export function RouteLoadingHint({ label }: { label?: string }) {
  return <ContentSkeleton rows={3} label={label ?? t("shell.loading")} />;
}
