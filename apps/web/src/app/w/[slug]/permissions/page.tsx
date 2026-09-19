"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const WorkspacePermissionsView = dynamic(
  () =>
    import("@/components/views/workspace-permissions-view").then((mod) => ({
      default: mod.WorkspacePermissionsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری دسترسی‌ها…" />,
  },
);

export default function WorkspacePermissionsPage() {
  return (
    <WorkspacePageGate page="permissions">
      <WorkspacePermissionsView />
    </WorkspacePageGate>
  );
}
