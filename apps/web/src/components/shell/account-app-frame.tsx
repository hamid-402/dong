"use client";

import type { ReactNode } from "react";
import { AppShellV2 } from "@/components/shell/app-shell-v2";
import { HubEmbedProvider } from "@/components/mosaic/hub-embed";

export function AccountAppFrame({ children }: { children: ReactNode }) {
  return (
    <AppShellV2>
      <HubEmbedProvider>{children}</HubEmbedProvider>
    </AppShellV2>
  );
}
