"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const WorkspaceChartsView = dynamic(
  () =>
    import("@/components/views/workspace-charts-view").then((mod) => ({
      default: mod.WorkspaceChartsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال خواندن نمودارها…" />,
  },
);

export default function WorkspaceChartsPage() {
  return (
    <WorkspacePageGate page="charts">
      <WorkspaceChartsView />
    </WorkspacePageGate>
  );
}
