"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const ProcurementView = dynamic(
  () =>
    import("@/components/views/procurement-view").then((mod) => ({
      default: mod.ProcurementView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری تدارکات…" />,
  },
);

export default function WorkspaceProcurementPage() {
  return <ProcurementView />;
}
