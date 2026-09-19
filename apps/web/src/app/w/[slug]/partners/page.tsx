"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const PartnershipView = dynamic(
  () =>
    import("@/components/views/partnership-view").then((mod) => ({
      default: mod.PartnershipView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری شرکا…" />,
  },
);

export default function WorkspacePartnersPage() {
  return (
    <WorkspacePageGate page="partners">
      <PartnershipView />
    </WorkspacePageGate>
  );
}
