"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const ShellToolsView = dynamic(
  () =>
    import("@/components/shell/shell-tools-view").then((mod) => ({
      default: mod.ShellToolsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری ابزارها…" />,
  },
);

export default function WorkspaceMorePage() {
  return <ShellToolsView />;
}
