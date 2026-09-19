"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const PaymentsView = dynamic(
  () =>
    import("@/components/views/payments-view").then((mod) => ({
      default: mod.PaymentsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری پرداخت‌ها…" />,
  },
);

export default function WorkspacePaymentsPage() {
  return (
    <WorkspacePageGate page="payments">
      <PaymentsView />
    </WorkspacePageGate>
  );
}
