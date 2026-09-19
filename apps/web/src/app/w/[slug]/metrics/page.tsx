"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const ProductMetricsView = dynamic(
  () =>
    import("@/components/views/product-metrics-view").then((mod) => ({
      default: mod.ProductMetricsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال خواندن متریک محصول…" />,
  },
);

export default function WorkspaceMetricsPage() {
  return (
    <WorkspacePageGate page="metrics" needRole>
      <ProductMetricsView />
    </WorkspacePageGate>
  );
}
