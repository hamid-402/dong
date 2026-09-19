"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const ProcurementView = dynamic(
  () =>
    import("@/components/views/procurement-view").then((mod) => ({
      default: mod.ProcurementView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری تدارکات…" />,
  },
);

export default function WorkspaceProcurementPage() {
  return (
    <WorkspacePageGate page="procurement">
      <ProcurementView />
    </WorkspacePageGate>
  );
}
