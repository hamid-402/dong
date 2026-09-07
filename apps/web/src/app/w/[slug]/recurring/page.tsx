"use client";

import dynamic from "next/dynamic";

const FinanceView = dynamic(
  () =>
    import("@/components/views/finance-view").then((mod) => ({ default: mod.FinanceView })),
  {
    ssr: false,
    loading: () => <p className="liveHint">در حال بارگذاری…</p>,
  },
);

export default function WorkspaceRecurringPage() {
  return <FinanceView focusPanel="reports" />;
}
