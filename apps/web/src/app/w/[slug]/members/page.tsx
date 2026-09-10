"use client";

import dynamic from "next/dynamic";
import { RouteLoadingHint } from "@/components/shell/route-loading-hint";

const WorkspaceInviteView = dynamic(
  () =>
    import("@/components/views/workspace-invite-view").then((mod) => ({
      default: mod.WorkspaceInviteView,
    })),
  {
    ssr: false,
    loading: () => <RouteLoadingHint label="در حال بارگذاری اعضا…" />,
  },
);

export default function WorkspaceMembersPage() {
  return <WorkspaceInviteView />;
}
