"use client";

import type { ReactNode } from "react";
import type { MembershipRole } from "@dang/contracts";
import { EmptyHint } from "@/components/ui-blocks";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import {
  spaceNavFlagsFromCapabilities,
  workspacePageAccess,
  type PageAccessResult,
} from "@/lib/workspace-page-access";
import type { WorkspacePage } from "@/lib/workspace-paths";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Props = {
  page: WorkspacePage;
  children: ReactNode;
  /** When true, resolve membership role before gating role-sensitive pages. */
  needRole?: boolean;
};

/**
 * Deep-link gate: keeps routes additive but shows an honest empty state when
 * template modules, product flags, or role policy disallow the page.
 */
export function WorkspacePageGate({ page, children, needRole = false }: Props) {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const [role, setRole] = useState<MembershipRole | "">("");
  const [roleReady, setRoleReady] = useState(!needRole);

  const workspace = chrome.workspaces.find((w) => w.id === scope.workspaceId);
  const template = workspace?.template;

  useEffect(() => {
    if (!needRole || !scope.workspaceId || !chrome.actor?.userId) {
      setRoleReady(true);
      return;
    }
    let cancelled = false;
    void api
      .listMembers(scope.workspaceId)
      .then((members) => {
        if (cancelled) return;
        setRole(
          members.find((m) => m.userId === chrome.actor?.userId)?.role ?? "",
        );
        setRoleReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRole("");
        setRoleReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needRole, scope.workspaceId, chrome.actor?.userId]);

  if (!chrome.ready || !roleReady) {
    return <p className="liveHint">در حال بررسی دسترسی…</p>;
  }

  const access: PageAccessResult = workspacePageAccess({
    page,
    template,
    flags: spaceNavFlagsFromCapabilities(chrome.capabilities),
    role,
  });

  if (!access.allowed) {
    return (
      <EmptyHint>
        <strong>دسترسی مجاز نیست.</strong> {access.reason}
      </EmptyHint>
    );
  }

  return <>{children}</>;
}
