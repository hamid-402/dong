"use client";

import dynamic from "next/dynamic";

const DailyLedgerView = dynamic(
  () =>
    import("@/components/views/daily-ledger-view").then((mod) => ({
      default: mod.DailyLedgerView,
    })),
  {
    ssr: false,
    loading: () => <p className="liveHint">در حال بارگذاری…</p>,
  },
);

export default function WorkspaceLedgerPage() {
  return <DailyLedgerView />;
}
