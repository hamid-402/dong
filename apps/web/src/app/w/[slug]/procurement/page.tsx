"use client";

import dynamic from "next/dynamic";

const ProcurementView = dynamic(
  () =>
    import("@/components/views/procurement-view").then((mod) => ({
      default: mod.ProcurementView,
    })),
  {
    ssr: false,
    loading: () => <p className="liveHint">در حال بارگذاری…</p>,
  },
);

export default function WorkspaceProcurementPage() {
  return <ProcurementView />;
}
