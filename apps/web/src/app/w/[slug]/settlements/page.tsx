"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const FinanceView = dynamic(
  () =>
    import("@/components/views/finance-view").then((mod) => ({ default: mod.FinanceView })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری تسویه…" />,
  },
);

export default function WorkspaceSettlementsPage() {
  return <FinanceView section="settlements" focusPanel="settlement" />;
}
