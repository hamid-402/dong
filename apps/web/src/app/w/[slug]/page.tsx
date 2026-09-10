"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const OverviewView = dynamic(
  () =>
    import("@/components/views/overview-view").then((mod) => ({
      default: mod.OverviewView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری خانه فضا…" />,
  },
);

export default function WorkspaceHomePage() {
  return <OverviewView />;
}
