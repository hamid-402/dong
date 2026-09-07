"use client";

import { ClassicToWorkspaceRedirect } from "@/components/shell/classic-to-workspace-redirect";

/** Additive alias — classic routes now land on `/w/[slug]` (query preserved). */
export function ClassicToHubRedirect() {
  return <ClassicToWorkspaceRedirect />;
}
