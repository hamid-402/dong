"use client";

import { ClassicToWorkspaceRedirect } from "@/components/shell/classic-to-workspace-redirect";

/** Classic bookmark `/overview` → `/w/[slug]` home (CLASSIC_PATH_TARGETS). */
export default function OverviewRedirect() {
  return <ClassicToWorkspaceRedirect />;
}
