"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

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
  return (
    <WorkspacePageGate page="ledger">
      <DailyLedgerView />
    </WorkspacePageGate>
  );
}
