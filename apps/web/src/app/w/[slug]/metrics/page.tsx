"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

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
  return <ProductMetricsView />;
}
