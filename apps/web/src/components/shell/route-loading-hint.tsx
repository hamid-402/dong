"use client";

import { EmptyHint } from "@/components/ui-blocks";

/** Shared route-level loading affordance for dynamic workspace pages. */
export function RouteLoadingHint({ label = "در حال بارگذاری…" }: { label?: string }) {
  return <EmptyHint loading>{label}</EmptyHint>;
}
