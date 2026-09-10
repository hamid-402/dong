"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const PartnershipView = dynamic(
  () =>
    import("@/components/views/partnership-view").then((mod) => ({
      default: mod.PartnershipView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری شرکا…" />,
  },
);

export default function WorkspacePartnersPage() {
  return <PartnershipView />;
}
