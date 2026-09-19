"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const ProposalsView = dynamic(
  () =>
    import("@/components/views/proposals-view").then((mod) => ({
      default: mod.ProposalsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری پیشنهادها…" />,
  },
);

export default function WorkspaceProposalsPage() {
  return (
    <WorkspacePageGate page="proposals">
      <ProposalsView />
    </WorkspacePageGate>
  );
}
