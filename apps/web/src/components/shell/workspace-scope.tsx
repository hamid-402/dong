"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppChrome } from "@/lib/use-app-chrome";

type WorkspaceScopeValue = {
  slug: string;
  workspaceId: string;
  ready: boolean;
};

const WorkspaceScopeContext = createContext<WorkspaceScopeValue | null>(null);

/**
 * Resolves `/w/[slug]` to the active workspace id and syncs AppChrome selection.
 */
export function WorkspaceScopeProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ slug: string }>();
  const slugParam = decodeURIComponent(params.slug ?? "");
  const chrome = useAppChrome();
  const router = useRouter();

  const match = useMemo(() => {
    if (!slugParam || !chrome.ready) return null;
    return (
      chrome.workspaces.find((w) => w.slug === slugParam) ??
      chrome.workspaces.find((w) => w.id === slugParam) ??
      null
    );
  }, [chrome.ready, chrome.workspaces, slugParam]);

  useEffect(() => {
    if (!chrome.ready) return;
    if (!slugParam) {
      router.replace("/spaces");
      return;
    }
    if (!match) {
      router.replace("/spaces");
      return;
    }
    if (match.id !== chrome.workspaceId) {
      chrome.selectWorkspace(match.id);
    }
  }, [chrome, match, router, slugParam]);

  const value = useMemo<WorkspaceScopeValue>(
    () => ({
      slug: match?.slug ?? slugParam,
      workspaceId: match?.id ?? "",
      ready: Boolean(match),
    }),
    [match, slugParam],
  );

  if (!chrome.ready) {
    return <p className="liveHint">در حال بارگذاری فضا…</p>;
  }

  if (!match) {
    return <p className="liveHint">این فضا پیدا نشد — در حال انتقال…</p>;
  }

  return (
    <WorkspaceScopeContext.Provider value={value}>{children}</WorkspaceScopeContext.Provider>
  );
}

export function useWorkspaceScope(): WorkspaceScopeValue {
  const ctx = useContext(WorkspaceScopeContext);
  if (!ctx) {
    throw new Error("useWorkspaceScope must be used under WorkspaceScopeProvider");
  }
  return ctx;
}

export function useOptionalWorkspaceScope(): WorkspaceScopeValue | null {
  return useContext(WorkspaceScopeContext);
}
