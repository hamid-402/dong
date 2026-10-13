"use client";

import { ClassicToWorkspaceRedirect } from "@/components/shell/classic-to-workspace-redirect";

/** Classic bookmark `/overview` → canonical `/home`. */
export default function OverviewRedirect() {
  return <ClassicToWorkspaceRedirect />;
}
