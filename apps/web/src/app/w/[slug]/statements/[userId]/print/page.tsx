"use client";

import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const StatementsView = dynamic(
  () =>
    import("@/components/views/statements-view").then((mod) => ({
      default: mod.StatementsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال آماده‌سازی چاپ…" />,
  },
);

function PrintInner() {
  const params = useParams<{ userId: string }>();
  const search = useSearchParams();
  const userId = decodeURIComponent(params.userId ?? "");
  const from = search.get("from") ?? undefined;
  const to = search.get("to") ?? undefined;
  const granularityRaw = search.get("granularity");
  const initialGranularity =
    granularityRaw === "day" ? "day" : granularityRaw === "period" ? "period" : undefined;
  return (
    <StatementsView
      focusUserId={userId}
      printMode
      initialFrom={from}
      initialTo={to}
      initialGranularity={initialGranularity}
      initialCatalogItemId={search.get("catalogItemId") ?? undefined}
    />
  );
}

export default function WorkspaceMemberStatementPrintPage() {
  return (
    <WorkspacePageGate page="statements">
      <Suspense fallback={<RouteLoadingHint label="در حال آماده‌سازی چاپ…" />}>
        <PrintInner />
      </Suspense>
    </WorkspacePageGate>
  );
}
