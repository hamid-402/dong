"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const AssetsView = dynamic(
  () =>
    import("@/components/views/assets-view").then((mod) => ({ default: mod.AssetsView })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری تجهیزات…" />,
  },
);

export default function WorkspaceAssetsPage() {
  return <AssetsView />;
}
