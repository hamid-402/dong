"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

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
  return <OrgFinanceView />;
}
