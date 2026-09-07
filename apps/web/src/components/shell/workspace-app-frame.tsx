"use client";

import type { ReactNode } from "react";
import { AppShellV2 } from "@/components/shell/app-shell-v2";
import { WorkspaceScopeProvider } from "@/components/shell/workspace-scope";
import { HubEmbedProvider } from "@/components/mosaic/hub-embed";

export function WorkspaceAppFrame({ children }: { children: ReactNode }) {
  return (
    <AppShellV2>
      <WorkspaceScopeProvider>
        <HubEmbedProvider>{children}</HubEmbedProvider>
      </WorkspaceScopeProvider>
    </AppShellV2>
  );
}
