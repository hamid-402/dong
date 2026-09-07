"use client";

import { createContext, useContext, type ReactNode } from "react";

const HubEmbedContext = createContext(false);

/** When true, child views are inside product shell (AppShellV2) — keep titles, avoid double app chrome. */
export function HubEmbedProvider({ children }: { children: ReactNode }) {
  return <HubEmbedContext.Provider value={true}>{children}</HubEmbedContext.Provider>;
}

export function useHubEmbed() {
  return useContext(HubEmbedContext);
}
