"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const StatementsView = dynamic(
  () =>
    import("@/components/views/statements-view").then((mod) => ({
      default: mod.StatementsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری صورتحساب…" />,
  },
);

function StatementsInner() {
  const search = useSearchParams();
  const from = search.get("from") ?? undefined;
  const to = search.get("to") ?? undefined;
  const catalogItemId = search.get("catalogItemId") ?? undefined;
  const granularityRaw = search.get("granularity");
  const initialGranularity = granularityRaw === "day" ? "day" : granularityRaw === "period" ? "period" : undefined;
  return (
    <StatementsView
      initialFrom={from}
      initialTo={to}
      initialGranularity={initialGranularity}
      initialCatalogItemId={catalogItemId ?? undefined}
    />
  );
}

export default function WorkspaceStatementsPage() {
  return (
    <WorkspacePageGate page="statements">
      <Suspense fallback={<RouteLoadingHint label="در حال بارگذاری صورتحساب…" />}>
        <StatementsInner />
      </Suspense>
    </WorkspacePageGate>
  );
}
