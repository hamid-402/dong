"use client";

import { createContext, useContext, type ReactNode } from "react";

const HubEmbedContext = createContext(false);

/** When true, AppShell renders children only (no sidebar chrome). */
export function HubEmbedProvider({ children }: { children: ReactNode }) {
  return <HubEmbedContext.Provider value={true}>{children}</HubEmbedContext.Provider>;
}

export function useHubEmbed() {
  return useContext(HubEmbedContext);
}
