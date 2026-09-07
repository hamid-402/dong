"use client";

import type { ReactNode } from "react";
import { AppShellV2 } from "@/components/shell/app-shell-v2";

/**
 * Hub entry chrome — now the unified Shell V2 (Phase 1 IA redesign).
 * Import name kept for additive compatibility with hub routes.
 */
export function MosaicLayout({ children }: { children: ReactNode }) {
  return <AppShellV2>{children}</AppShellV2>;
}
