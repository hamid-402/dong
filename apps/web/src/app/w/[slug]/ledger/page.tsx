"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const DailyLedgerView = dynamic(
  () =>
    import("@/components/views/daily-ledger-view").then((mod) => ({
      default: mod.DailyLedgerView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری دفتر روزانه…" />,
  },
);

export default function WorkspaceLedgerPage() {
  return <DailyLedgerView />;
}
