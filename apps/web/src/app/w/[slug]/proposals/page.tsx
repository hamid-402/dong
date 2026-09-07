"use client";

import dynamic from "next/dynamic";

const ProposalsView = dynamic(
  () =>
    import("@/components/views/proposals-view").then((mod) => ({ default: mod.ProposalsView })),
  {
    ssr: false,
    loading: () => <p className="liveHint">در حال بارگذاری…</p>,
  },
);

export default function WorkspaceProposalsPage() {
  return <ProposalsView />;
}
