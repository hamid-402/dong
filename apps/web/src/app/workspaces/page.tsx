"use client";

import { ClassicToHubRedirect } from "@/components/mosaic/classic-to-hub-redirect";

/** Bare `/workspaces` → `/spaces`. Panel hashes still open the finance page. */
export default function WorkspacesRedirect() {
  return <ClassicToHubRedirect />;
}