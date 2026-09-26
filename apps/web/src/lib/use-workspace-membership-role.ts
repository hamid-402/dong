"use client";

import { useEffect, useState } from "react";
import type { MembershipRole } from "@dang/contracts";
import { api } from "@/lib/api";
import { useAppChrome } from "@/lib/use-app-chrome";

type State = {
  role: MembershipRole | "";
  ready: boolean;
};

/**
 * Resolves the actor's membership role in the active workspace.
 * Shared by nav, page gate consumers, and persona chrome — one fetch per workspace.
 */
export function useWorkspaceMembershipRole(
  workspaceId?: string | null,
): State {
  const chrome = useAppChrome();
  const id = workspaceId || chrome.workspaceId || "";
  const userId = chrome.actor?.userId ?? "";
  const [role, setRole] = useState<MembershipRole | "">("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!id || !userId) {
      setRole("");
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    void api
      .listMembers(id)
      .then((members) => {
        if (cancelled) return;
        setRole(members.find((m) => m.userId === userId)?.role ?? "");
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setRole("");
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id, userId]);

  return { role, ready };
}
