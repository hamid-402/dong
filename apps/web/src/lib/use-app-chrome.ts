"use client";

import { useEffect, useState } from "react";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";

export type AppChromeState = {
  workspaceName: string;
  workspaceId: string;
  userName: string;
  persistenceLabel: string;
};

/** Shared workspace/session context for product shells. */
export function useAppChrome(): AppChromeState & { ready: boolean; error: string | null } {
  const [state, setState] = useState<AppChromeState>({
    workspaceName: "",
    workspaceId: "",
    userName: "",
    persistenceLabel: "دفتر عملیات مشترک",
  });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const identity = getDevIdentity();
        setDevIdentity(identity.subject, identity.displayName);
        const [session, caps, workspaces] = await Promise.all([
          api.session(),
          api.capabilities().catch(() => null),
          api.listWorkspaces(),
        ]);
        if (cancelled) return;
        const workspace = workspaces[0];
        setState({
          workspaceName: workspace?.name ?? "",
          workspaceId: workspace?.id ?? "",
          userName: session.actor?.displayName ?? identity.displayName,
          persistenceLabel: caps
            ? `ذخیره ${caps.iamPersistence}/${caps.expensePersistence}`
            : "دفتر عملیات مشترک",
        });
        setReady(true);
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "خطای اتصال");
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, ready, error };
}
