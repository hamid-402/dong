"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";
import { WorkspacePageGate } from "@/components/shell/workspace-page-gate";

const CatalogView = dynamic(
  () =>
    import("@/components/views/catalog-view").then((mod) => ({
      default: mod.CatalogView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری کاتالوگ…" />,
  },
);

export default function WorkspaceCatalogPage() {
  return (
    <WorkspacePageGate page="catalog">
      <CatalogView />
    </WorkspacePageGate>
  );
}
