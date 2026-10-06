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
  DisplayUnitPreference,
  NotificationSummary,
  SessionSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import { api, getDevIdentity, setDevIdentity, type SystemCapabilities } from "@/lib/api";
import { DisplayUnitProvider } from "@/lib/display-unit";
import { persistenceLabelFa } from "@/lib/status-labels";
import { publishLiveInvalidation } from "@/lib/live-invalidation";
import { openSseStream } from "@/lib/sse-client";
import {
  flushOfflineMutations,
  isRetryableOfflineError,
  readOfflineMutations,
  removeOfflineMutation,
} from "@/lib/offline-mutation-queue";
import { apiFetch } from "@/lib/api/client";
import {
  readStoredWorkspaceId,
  writeStoredWorkspaceId,
} from "@/lib/workspace-storage";
import { filterVisibleWorkspaces } from "@/lib/demo-workspaces";
import { rememberWorkspaceVisit } from "@/lib/workspace-directory-prefs";

export type AppChromeState = {
  workspaceName: string;
  workspaceId: string;
  userName: string;
  persistenceLabel: string;
  allowDevAuth: boolean;
  /** S11-14 — demo seed button; never true in production capabilities. */
  demoSeedAllowed: boolean;
  /** Full capabilities from one bootstrap — views must not re-fetch. */
  capabilities: SystemCapabilities | null;
  /** Actor from /auth/me (preferred) — views must not re-fetch session/me for identity. */
  actor: AuthActor | null;
  /** Platform role from /auth/me — for console discovery only. */
  platformRole: string | null;
  /** Session-shaped summary derived from me + auth mode (for legacy view props). */
  session: SessionSummary | null;
  workspaces: WorkspaceSummary[];
  notifications: NotificationSummary[];
  unreadCount: number;
  /** Online member userIds from SSE presence (empty when realtime off). */
  presenceUserIds: string[];
  /** True when capabilities.providers.realtime is sse_local or sse_redis. */
  presenceLive: boolean;
  /**
   * SSE client status when providers.realtime is sse_local or sse_redis.
   * `reconnecting` is client retry — fan-out mode comes from capabilities.realtime.
   */
  sseStatus: "off" | "connecting" | "open" | "reconnecting" | "closed";
  /** Last SSE reconnect attempt metadata (honest; resets when open). */
  sseReconnect?: { attempt: number; delayMs: number } | null;
  /** Pending offline mutations (R10-19) — only when queue non-empty. */
  offlineQueueCount: number;
  /** Flush offline mutation queue (manual retry from bell). */
  flushOfflineQueue: () => Promise<void>;
  /** Discard one offline mutation by id (user cancel). */
  discardOfflineMutation: (id: string) => void;
  ready: boolean;
  error: string | null;
  /** Capabilities fetch failed while other chrome may still work — not silent empty. */
  capabilitiesUnavailable: boolean;
  /** Notifications fetch failed — distinct from empty inbox. */
  notificationsError: string | null;
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
  const [demoSeedAllowed, setDemoSeedAllowed] = useState(false);
  const [capabilities, setCapabilities] = useState<SystemCapabilities | null>(null);
  const [actor, setActor] = useState<AuthActor | null>(null);
  const [platformRole, setPlatformRole] = useState<string | null>(null);
  const [userDisplayUnit, setUserDisplayUnit] = useState<DisplayUnitPreference | null>(
    null,
  );
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [presenceUserIds, setPresenceUserIds] = useState<string[]>([]);
  const [sseStatus, setSseStatus] = useState<
    AppChromeState["sseStatus"]
  >("off");
  const [sseReconnect, setSseReconnect] = useState<{
    attempt: number;
    delayMs: number;
  } | null>(null);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capabilitiesUnavailable, setCapabilitiesUnavailable] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refreshChrome = useCallback(() => setTick((n) => n + 1), []);

  const selectWorkspace = useCallback((id: string) => {
    setWorkspaceId(id);
    writeStoredWorkspaceId(id);
    rememberWorkspaceVisit(id);
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!workspaceId) {
      setNotifications([]);
      setNotificationsError(null);
      return;
    }
    try {
      const list = await api.listNotifications(workspaceId);
      setNotifications(list);
      setNotificationsError(null);
    } catch {
      setNotifications([]);
      setNotificationsError("بارگذاری اعلان‌ها ناموفق بود — دوباره تلاش کنید.");
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
        const [meSettled, capsSettled, list] = await Promise.all([
          api.me().then(
            (v) => ({ ok: true as const, value: v }),
            () => ({ ok: false as const, value: null }),
          ),
          api.capabilities().then(
            (v) => ({ ok: true as const, value: v }),
            () => ({ ok: false as const, value: null }),
          ),
          api.listWorkspaces(),
        ]);
        if (cancelled) return;

        const me = meSettled.ok ? meSettled.value : null;
        const caps = capsSettled.ok ? capsSettled.value : null;
        const capsFailed = !capsSettled.ok;

        const stored = readStoredWorkspaceId();
        const visible = filterVisibleWorkspaces(list);
        const selected =
          visible.find((w) => w.id === stored)?.id ?? visible[0]?.id ?? "";
        const nextActor = me?.actor ?? null;

        setWorkspaces(visible);
        setWorkspaceId(selected);
        if (selected) writeStoredWorkspaceId(selected);
        else writeStoredWorkspaceId("");
        setActor(nextActor);
        setPlatformRole(me?.platformRole ?? "user");
        setUserDisplayUnit(me?.displayUnit ?? null);
        setUserName(nextActor?.displayName ?? identity.displayName);
        setCapabilities(caps);
        setCapabilitiesUnavailable(capsFailed);
        setPersistenceLabel(
          caps
            ? persistenceLabelFa(caps.persistence, caps.databaseConfigured)
            : capsFailed
              ? "قابلیت‌ها در دسترس نیست"
              : "بدون اتصال",
        );
        setAllowDevAuth(Boolean(caps?.allowDevAuth));
        // Only explicit true — never infer from allowDevAuth when field is missing.
        setDemoSeedAllowed(caps?.demoSeedAllowed === true);
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
      setNotificationsError(null);
      setPresenceUserIds([]);
      return;
    }
    void (async () => {
      try {
        const list = await api.listNotifications(workspaceId);
        if (!cancelled) {
          setNotifications(list);
          setNotificationsError(null);
        }
      } catch {
        if (!cancelled) {
          setNotifications([]);
          setNotificationsError("بارگذاری اعلان‌ها ناموفق بود — دوباره تلاش کنید.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, tick]);

  /** R10-18: SSE when capabilities.providers.realtime is sse_local|sse_redis; else soft poll. */
  useEffect(() => {
    if (!workspaceId || !ready) return;
    const realtime = capabilities?.providers?.realtime;
    if (realtime === "sse_local" || realtime === "sse_redis") {
      const stop = openSseStream(`/workspaces/${workspaceId}/notifications/stream`, {
        onStatus: (status) => {
          setSseStatus(status === "closed" ? "closed" : status);
          if (status === "open") setSseReconnect(null);
        },
        onReconnectInfo: (info) => setSseReconnect(info),
        onEvent: (event, data) => {
          if (event === "notification" || event === "notification.read") {
            try {
              const n = JSON.parse(data) as NotificationSummary;
              setNotifications((prev) => {
                const without = prev.filter((x) => x.id !== n.id);
                return [n, ...without].sort((a, b) =>
                  b.createdAt.localeCompare(a.createdAt),
                );
              });
            } catch {
              /* ignore malformed */
            }
            return;
          }
          if (event === "presence.snapshot") {
            try {
              const body = JSON.parse(data) as { userIds?: string[] };
              setPresenceUserIds(Array.isArray(body.userIds) ? body.userIds : []);
            } catch {
              /* ignore */
            }
            return;
          }
          if (event === "presence.join") {
            try {
              const body = JSON.parse(data) as { userId?: string };
              if (!body.userId) return;
              setPresenceUserIds((prev) =>
                prev.includes(body.userId!) ? prev : [...prev, body.userId!],
              );
            } catch {
              /* ignore */
            }
            return;
          }
          if (event === "presence.leave") {
            try {
              const body = JSON.parse(data) as { userId?: string };
              if (!body.userId) return;
              setPresenceUserIds((prev) => prev.filter((id) => id !== body.userId));
            } catch {
              /* ignore */
            }
            return;
          }
          if (event === "data.invalidate") {
            // Finance data changed server-side; pages listening on the bus refetch.
            try {
              const body = JSON.parse(data) as {
                workspaceId?: string;
                topics?: string[];
                at?: string;
              };
              if (!Array.isArray(body.topics) || body.topics.length === 0) return;
              publishLiveInvalidation({
                workspaceId: body.workspaceId ?? workspaceId,
                topics: body.topics,
                at: body.at ?? new Date().toISOString(),
              });
            } catch {
              /* ignore */
            }
          }
        },
      });
      const reconcile = window.setInterval(() => {
        void refreshNotifications();
      }, 90_000);
      return () => {
        stop();
        setSseStatus("off");
        window.clearInterval(reconcile);
      };
    }

    setSseStatus("off");
    setPresenceUserIds([]);
    const poll = window.setInterval(() => {
      void refreshNotifications();
    }, 45_000);
    return () => window.clearInterval(poll);
  }, [workspaceId, ready, capabilities?.providers?.realtime, refreshNotifications]);

  /** R10-19: flush offline mutation queue when back online. */
  useEffect(() => {
    if (!ready || capabilities?.providers?.offlineSync !== "mutation_queue_v1") {
      setOfflineQueueCount(0);
      return;
    }
    const refreshCount = () => {
      try {
        setOfflineQueueCount(readOfflineMutations(window.localStorage).length);
      } catch {
        setOfflineQueueCount(0);
      }
    };
    refreshCount();
    const flush = async () => {
      try {
        await flushOfflineMutations(
          window.localStorage,
          (path, init, idempotencyKey) => apiFetch(path, init, idempotencyKey),
          isRetryableOfflineError,
        );
      } finally {
        refreshCount();
      }
    };
    const onOnline = () => {
      void flush();
    };
    window.addEventListener("online", onOnline);
    const tick = window.setInterval(refreshCount, 15_000);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void flush();
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(tick);
    };
  }, [ready, capabilities?.providers?.offlineSync, tick]);

  const flushOfflineQueue = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (capabilities?.providers?.offlineSync !== "mutation_queue_v1") return;
    try {
      await flushOfflineMutations(
        window.localStorage,
        (path, init, idempotencyKey) => apiFetch(path, init, idempotencyKey),
        isRetryableOfflineError,
      );
    } finally {
      try {
        setOfflineQueueCount(readOfflineMutations(window.localStorage).length);
      } catch {
        setOfflineQueueCount(0);
      }
    }
  }, [capabilities?.providers?.offlineSync]);

  const discardOfflineMutation = useCallback(
    (id: string) => {
      if (typeof window === "undefined") return;
      if (capabilities?.providers?.offlineSync !== "mutation_queue_v1") return;
      try {
        removeOfflineMutation(window.localStorage, id);
        setOfflineQueueCount(readOfflineMutations(window.localStorage).length);
      } catch {
        /* ignore storage errors */
      }
    },
    [capabilities?.providers?.offlineSync],
  );

  const workspaceName = workspaces.find((w) => w.id === workspaceId)?.name ?? "";
  const workspaceDisplayUnit =
    workspaces.find((w) => w.id === workspaceId)?.displayUnit ?? null;
  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const session = useMemo(() => sessionFromActor(actor), [actor]);
  const presenceLive =
    capabilities?.providers?.realtime === "sse_local" ||
    capabilities?.providers?.realtime === "sse_redis";

  const value = useMemo<AppChromeState>(
    () => ({
      workspaceName,
      workspaceId,
      userName,
      persistenceLabel,
      allowDevAuth,
      demoSeedAllowed,
      capabilities,
      actor,
      platformRole,
      session,
      workspaces,
      notifications,
      unreadCount,
      presenceUserIds,
      presenceLive,
      sseStatus,
      sseReconnect,
      offlineQueueCount,
      flushOfflineQueue,
      discardOfflineMutation,
      ready,
      error,
      capabilitiesUnavailable,
      notificationsError,
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
      demoSeedAllowed,
      capabilities,
      actor,
      platformRole,
      session,
      workspaces,
      notifications,
      unreadCount,
      presenceUserIds,
      presenceLive,
      sseStatus,
      sseReconnect,
      offlineQueueCount,
      flushOfflineQueue,
      discardOfflineMutation,
      ready,
      error,
      capabilitiesUnavailable,
      notificationsError,
      selectWorkspace,
      refreshChrome,
      refreshNotifications,
      markNotificationRead,
    ],
  );

  return (
    <DisplayUnitProvider
      userPreference={userDisplayUnit}
      workspaceUnit={workspaceDisplayUnit}
    >
      <AppChromeContext.Provider value={value}>{children}</AppChromeContext.Provider>
    </DisplayUnitProvider>
  );
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
