"use client";

import type { ReactNode } from "react";
import { useHubEmbed } from "@/components/mosaic/hub-embed";
import { AppShellV2 } from "@/components/shell/app-shell-v2";
import { useShellV2 } from "@/components/shell/shell-v2-context";
import { ShellIconSvg, type ShellIcon } from "@/components/shell/shell-icons";

export type { ShellIcon };
export { ShellIconSvg };

/**
 * Product chrome. Inside AppShellV2 or a hub embed this is a passthrough.
 * Outside those mounts it is a thin wrapper of AppShellV2 (one chrome, canonical nav).
 */
export function AppShell({
  children,
  motionOff = false,
}: {
  children: ReactNode;
  workspaceName?: string;
  workspaceId?: string;
  userName?: string;
  persistenceLabel?: string;
  rail?: ReactNode;
  topBarActions?: ReactNode;
  motionOff?: boolean;
  notificationUnreadCount?: number;
}) {
  const embedded = useHubEmbed();
  const inShellV2 = useShellV2();
  const body = motionOff ? <div className="motionOff">{children}</div> : children;

  if (embedded || inShellV2) return body;
  return <AppShellV2>{body}</AppShellV2>;
}
