"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthActor,
  NotificationSummary,
  SessionSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import { api, getDevIdentity, setDevIdentity, type SystemCapabilities } from "@/lib/api";
import { persistenceLabelFa } from "@/lib/status-labels";
import {
  readStoredWorkspaceId,
  writeStoredWorkspaceId,
} from "@/lib/workspace-storage";

export type AppChromeState = {
  workspaceName: string;
  workspaceId: string;
  userName: string;
  persistenceLabel: string;
  allowDevAuth: boolean;
  /** Full capabilities from one bootstrap — views must not re-fetch. */
  capabilities: SystemCapabilities | null;
  /** Actor from /auth/me (preferred) — views must not re-fetch session/me for identity. */
  actor: AuthActor | null;
  /** Session-shaped summary derived from me + auth mode (for legacy view props). */
  session: SessionSummary | null;
  workspaces: WorkspaceSummary[];
  notifications: NotificationSummary[];
  unreadCount: number;
  ready: boolean;
  error: string | null;
  selectWorkspace: (id: string) => void;
  refreshChrome: () => void;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
};

const AppChromeContext = createContext<AppChromeState | null>(null);

function sessionFromActor(actor: AuthActor | null): SessionSummary | null {
  if (!actor) return null;
  return {
    authenticated: true,
    mode: actor.authMode,
    actor,
  };
}

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [userName, setUserName] = useState("");
  const [persistenceLabel, setPersistenceLabel] = useState("در حال بارگذاری…");
  const [allowDevAuth, setAllowDevAuth] = useState(false);
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [actor, setActor] = useState<AuthActor | null>(null);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refreshChrome = useCallback(() => setTick((n) => n + 1), []);

  const selectWorkspace = useCallback((id: string) => {
    setWorkspaceId(id);
    writeStoredWorkspaceId(id);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!workspaceId) {
      setNotifications([]);
      return;
    }
    try {
      const list = await api.listNotifications(workspaceId);
      setNotifications(list);
    } catch {
      setNotifications([]);
    }
  }, [workspaceId]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!workspaceId) return;
      const updated = await api.markNotificationRead(workspaceId, notificationId);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? updated : item)),
      );
    },
    [workspaceId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const identity = getDevIdentity();
        setDevIdentity(identity.subject, identity.displayName);
        // SessionGate already verified auth — single bootstrap for product chrome.
        const [me, caps, list] = await Promise.all([
          api.me().catch(() => null),
          api.capabilities().catch(() => null),
          api.listWorkspaces(),
        ]);
        if (cancelled) return;

        const stored = readStoredWorkspaceId();
        const selected = list.find((w) => w.id === stored)?.id ?? list[0]?.id ?? "";
        const nextActor = me?.actor ?? null;

        setWorkspaces(list);
        setWorkspaceId(selected);
        if (selected) writeStoredWorkspaceId(selected);
        setActor(nextActor);
        setUserName(nextActor?.displayName ?? identity.displayName);
        setCapabilities(caps);
        setPersistenceLabel(
          caps
            ? persistenceLabelFa(caps.persistence, caps.databaseConfigured)
            : "بدون اتصال",
        );
        setAllowDevAuth(Boolean(caps?.allowDevAuth));
        setReady(true);
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "خطای اتصال";
          setError(
            /Internal Server Error|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)
              ? "API در دسترس نیست. در ترمینال جداگانه: pnpm dev:api"
              : msg,
          );
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) {
      setNotifications([]);
      return;
    }
    void (async () => {
      try {
        const list = await api.listNotifications(workspaceId);
        if (!cancelled) setNotifications(list);
      } catch {
        if (!cancelled) setNotifications([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, tick]);

  const workspaceName = workspaces.find((w) => w.id === workspaceId)?.name ?? "";
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const session = useMemo(() => sessionFromActor(actor), [actor]);

  const value = useMemo<AppChromeState>(
    () => ({
      workspaceName,
      workspaceId,
      userName,
      persistenceLabel,
      allowDevAuth,
      capabilities,
      actor,
      session,
      workspaces,
      notifications,
      unreadCount,
      ready,
      error,
      selectWorkspace,
      refreshChrome,
      refreshNotifications,
      markNotificationRead,
    }),
    [
      workspaceName,
      workspaceId,
      userName,
      persistenceLabel,
      allowDevAuth,
      capabilities,
      actor,
      session,
      workspaces,
      notifications,
      unreadCount,
      ready,
      error,
      selectWorkspace,
      refreshChrome,
      refreshNotifications,
      markNotificationRead,
    ],
  );

  return <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>;
}

/** Shared workspace/session context for product shells. */
export function useAppChrome(): AppChromeState {
  const ctx = useContext(AppChromeContext);
  if (!ctx) {
    throw new Error("useAppChrome must be used within AppChromeProvider");
  }
  return ctx;
}

export function useOptionalAppChrome(): AppChromeState | null {
  return useContext(AppChromeContext);
}
