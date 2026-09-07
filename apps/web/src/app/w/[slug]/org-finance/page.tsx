"use client";

import dynamic from "next/dynamic";

const OrgFinanceView = dynamic(
  () =>
    import("@/components/views/org-finance-view").then((mod) => ({
      default: mod.OrgFinanceView,
    })),
  {
    ssr: false,
    loading: () => <p className="liveHint">در حال بارگذاری…</p>,
  },
);

export default function WorkspaceOrgFinancePage() {
  return <OrgFinanceView />;
}
