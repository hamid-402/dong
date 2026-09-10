"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const ProposalsView = dynamic(
  () =>
    import("@/components/views/proposals-view").then((mod) => ({
      default: mod.ProposalsView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری پیشنهادها…" />,
  },
);

export default function WorkspaceProposalsPage() {
  return <ProposalsView />;
}
