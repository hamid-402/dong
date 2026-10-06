"use client";

import { SpacesHubView } from "@/components/views/spaces-hub-view";

/**
 * App home — unified spaces hub (balances, kinds, searchable list).
 * Legacy `/spaces` redirects here.
 */
export function AppHomeView() {
  return <SpacesHubView />;
}
