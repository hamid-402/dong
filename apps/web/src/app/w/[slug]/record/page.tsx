"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const MoneyRecordChooserView = dynamic(
  () =>
    import("@/components/views/money-record-chooser-view").then((mod) => ({
      default: mod.MoneyRecordChooserView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="مسیر ثبت…" />,
  },
);

export default function WorkspaceRecordPage() {
  return <MoneyRecordChooserView />;
}
