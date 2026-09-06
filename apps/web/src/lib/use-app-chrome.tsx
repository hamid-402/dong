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
import type { NotificationSummary, WorkspaceSummary } from "@dang/contracts";
import { api, getDevIdentity, setDevIdentity } from "@/lib/api";
import { persistenceLabelFa } from "@/lib/status-labels";

const WORKSPACE_KEY = "dang.activeWorkspaceId";

export type AppChromeState = {
  workspaceName: string;
  workspaceId: string;
  userName: string;
  persistenceLabel: string;
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

function readStoredWorkspaceId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(WORKSPACE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredWorkspaceId(id: string) {
  try {
    localStorage.setItem(WORKSPACE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function AppChromeProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [userName, setUserName] = useState("");
  const [persistenceLabel, setPersistenceLabel] = useState("دفتر عملیات مشترک");
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
        // SessionGate already verified auth — avoid a second /auth/session round-trip.
        const [me, caps, list] = await Promise.all([
          api.me().catch(() => null),
          api.capabilities().catch(() => null),
          api.listWorkspaces(),
        ]);
        if (cancelled) return;

        const stored = readStoredWorkspaceId();
        const selected = list.find((w) => w.id === stored)?.id ?? list[0]?.id ?? "";

        setWorkspaces(list);
        setWorkspaceId(selected);
        if (selected) writeStoredWorkspaceId(selected);
        setUserName(me?.actor?.displayName ?? identity.displayName);
        setPersistenceLabel(
          caps
            ? persistenceLabelFa(caps.persistence, caps.databaseConfigured)
            : "بدون اتصال",
        );
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

  const value = useMemo<AppChromeState>(
    () => ({
      workspaceName,
      workspaceId,
      userName,
      persistenceLabel,
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
