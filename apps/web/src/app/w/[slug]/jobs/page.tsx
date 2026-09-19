"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const JobsDlqView = dynamic(
  () =>
    import("@/components/views/jobs-view").then((mod) => ({
      default: mod.JobsDlqView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال خواندن صف کارها…" />,
  },
);

export default function WorkspaceJobsPage() {
  return (
    <WorkspacePageGate page="jobs" needRole>
      <JobsDlqView />
    </WorkspacePageGate>
  );
}
