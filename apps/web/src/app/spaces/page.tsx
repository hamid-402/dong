"use client";

import { SpacesHubView } from "@/components/views/spaces-hub-view";

/** Canonical space list. `/groups` and `/workspaces` redirect here. */
export default function SpacesPage() {
  return <SpacesHubView directoryOnly />;
}
