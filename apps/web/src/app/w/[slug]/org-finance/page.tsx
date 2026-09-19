"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const OrgFinanceView = dynamic(
  () =>
    import("@/components/views/org-finance-view").then((mod) => ({
      default: mod.OrgFinanceView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری مالی سازمان…" />,
  },
);

export default function WorkspaceOrgFinancePage() {
  return (
    <WorkspacePageGate page="orgFinance">
      <OrgFinanceView />
    </WorkspacePageGate>
  );
}
