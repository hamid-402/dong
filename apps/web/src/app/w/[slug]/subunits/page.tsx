"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const SubunitsView = dynamic(
  () =>
    import("@/components/views/subunits-view").then((mod) => ({
      default: mod.SubunitsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری واحدها…" />,
  },
);

export default function WorkspaceSubunitsPage() {
  return <SubunitsView />;
}
