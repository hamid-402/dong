"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationSummary } from "@dang/contracts";
import { ShellIconSvg } from "@/components/app-shell";
import { EmptyStateBlock } from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { notificationActionLabel, notificationInboxActions, notificationTargetHref } from "@/lib/notification-routes";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";
import { readOfflineMutations } from "@/lib/offline-mutation-queue";
import { formatFaDateTime } from "@/lib/fa-datetime";
import { t } from "@/lib/i18n";
import type { MembershipSummary } from "@dang/contracts";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatWhen(iso: string): string {
  return formatFaDateTime(iso);
}

type NotificationBellProps = {
  workspaceId?: string;
  /** Standalone mode when AppChromeProvider is absent. */
  initialUnreadCount?: number;
};

function isSseRealtime(realtime: string | undefined): boolean {
  return realtime === "sse_local" || realtime === "sse_redis";
}

function sseAriaLabel(
  realtime: string | undefined,
  status: string | undefined,
): string {
  if (!isSseRealtime(realtime)) return t("sse.ariaPoll");
  if (status === "connecting") return t("sse.ariaConnecting");
  if (status === "reconnecting") return t("sse.ariaReconnect");
  if (status === "open") {
    return realtime === "sse_redis" ? t("sse.ariaLiveRedis") : t("sse.ariaLive");
  }
  return t("sse.ariaPoll");
}

export function NotificationBell({ workspaceId, initialUnreadCount = 0 }: NotificationBellProps) {
  const router = useRouter();
  const chrome = useOptionalAppChrome();
  const shell = useShellV2Api();
  const panelId = useId();
  const effectiveWorkspaceId = workspaceId ?? chrome?.workspaceId ?? "";
  const [localOpen, setLocalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [offlineItems, setOfflineItems] = useState(() =>
    typeof window !== "undefined" ? readOfflineMutations(window.localStorage) : [],
  );
  const [presenceLabels, setPresenceLabels] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const open = shell ? shell.notificationsOpen : localOpen;
  const setOpen = shell ? shell.setNotificationsOpen : setLocalOpen;

  const unreadCount = chrome
    ? chrome.unreadCount
    : items.length > 0
      ? items.filter((n) => !n.readAt).length
      : initialUnreadCount;

  useEffect(() => {
    setMounted(true);
  }, []);

  function loadNotifications() {
    if (!effectiveWorkspaceId || chrome) return;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const list = await api.listNotifications(effectiveWorkspaceId);
        setItems(list);
      } catch (err: unknown) {
        setError(friendlyErrorMessage(err, "بارگذاری اعلان‌ها ناموفق"));
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }

  useEffect(() => {
    if (!open || !effectiveWorkspaceId) return;
    if (chrome) {
      setItems(chrome.notifications);
      setLoading(false);
      setError(null);
      try {
        setOfflineItems(readOfflineMutations(window.localStorage));
      } catch {
        setOfflineItems([]);
      }
      return;
    }
    loadNotifications();
  }, [open, effectiveWorkspaceId, chrome, chrome?.notifications, chrome?.offlineQueueCount]);

  useEffect(() => {
    if (!open || !effectiveWorkspaceId || !chrome?.presenceUserIds.length) {
      setPresenceLabels([]);
      return;
    }
    const ids = chrome.presenceUserIds;
    let cancelled = false;
    void api
      .listMembers(effectiveWorkspaceId)
      .then((members: MembershipSummary[]) => {
        if (cancelled) return;
        const byId = new Map(
          members.map((m) => [m.userId, m.displayName?.trim() || m.userId]),
        );
        setPresenceLabels(ids.map((id) => byId.get(id) ?? id.slice(0, 8)));
      })
      .catch(() => {
        if (!cancelled) setPresenceLabels(ids.map((id) => id.slice(0, 8)));
      });
    return () => {
      cancelled = true;
    };
  }, [open, effectiveWorkspaceId, chrome?.presenceUserIds]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusFirst = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 0);

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusFirst);
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      (previouslyFocused.current ?? triggerRef.current)?.focus?.();
    };
  }, [open, setOpen]);

  function handleItemClick(notification: NotificationSummary) {
    if (!effectiveWorkspaceId) return;
    startTransition(() => {
      void (async () => {
        try {
          setActionError(null);
          if (!notification.readAt) {
            if (chrome) {
              await chrome.markNotificationRead(notification.id);
              setItems(chrome.notifications);
            } else {
              const updated = await api.markNotificationRead(
                effectiveWorkspaceId,
                notification.id,
              );
              setItems((prev) => prev.map((n) => (n.id === notification.id ? updated : n)));
            }
          }
          const href = notificationTargetHref(
            notification,
            chrome?.workspaces.find((w) => w.id === effectiveWorkspaceId)?.slug,
          );
          if (href) {
            setOpen(false);
            router.push(href);
          }
        } catch (err: unknown) {
          setActionError(friendlyErrorMessage(err, "علامت‌خوانده ناموفق — دوباره تلاش کنید"));
        }
      })();
    });
  }

  if (!effectiveWorkspaceId) return null;

  const list = chrome && open ? chrome.notifications : items;
  const aria = sseAriaLabel(
    chrome?.capabilities?.providers?.realtime,
    chrome?.sseStatus,
  );

  const panel =
    open && mounted
      ? createPortal(
          <div className="notifPortal" ref={portalRef}>
            <button
              type="button"
              className="notifPortal__backdrop"
              aria-label="بستن اعلان‌ها"
              onClick={() => setOpen(false)}
            />
            <div
              id={panelId}
              ref={panelRef}
              className="notifPanel notifPanel--portal"
              role="dialog"
              aria-modal="true"
              aria-label="اعلان‌ها"
            >
              <header className="notifPanel__head">
                <b>اعلان‌ها</b>
                {unreadCount > 0 ? (
                  <span className="notifPanel__count">{unreadCount} خوانده‌نشده</span>
                ) : null}
              </header>
              {chrome && isSseRealtime(chrome.capabilities?.providers?.realtime) ? (
                <p className="notifPanel__empty" style={{ margin: 0, paddingBlock: "0.35rem" }}>
                  {chrome.sseStatus === "reconnecting" || chrome.sseStatus === "connecting"
                    ? `${
                        chrome.capabilities?.providers?.realtime === "sse_redis"
                          ? t("sse.statusConnectingRedis")
                          : t("sse.statusConnectingLocal")
                      }${
                        chrome.sseReconnect
                          ? ` · تلاش ${chrome.sseReconnect.attempt} · ≈${Math.round(chrome.sseReconnect.delayMs / 1000)}ث`
                          : ""
                      }`
                    : chrome.sseStatus === "open"
                      ? `${t("sse.statusLive", {
                          count: chrome.presenceUserIds.length,
                          mode:
                            chrome.capabilities?.providers?.realtime === "sse_redis"
                              ? t("sse.modeRedis")
                              : t("sse.modeLocal"),
                        })}${
                          presenceLabels.length > 0
                            ? ` · ${presenceLabels.slice(0, 6).join("، ")}${
                                presenceLabels.length > 6 ? "…" : ""
                              }`
                            : ""
                        }`
                      : t("sse.statusIdle", {
                          count: chrome.presenceUserIds.length,
                          mode:
                            chrome.capabilities?.providers?.realtime === "sse_redis"
                              ? t("sse.modeRedis")
                              : t("sse.modeLocal"),
                        })}
                </p>
              ) : null}
              {chrome &&
              chrome.capabilities?.providers?.offlineSync === "mutation_queue_v1" &&
              offlineItems.length > 0 ? (
                <div style={{ padding: "0.35rem 0.75rem", borderBottom: "1px solid var(--border, #ddd)" }}>
                  <b>{t("offline.queueTitle")}</b>
                  <ul className="stackList" style={{ margin: "0.35rem 0" }}>
                    {offlineItems.map((m) => (
                      <li key={m.id}>
                        {m.label}
                        {" · "}
                        {formatWhen(m.createdAt)}
                        {m.attemptCount ? ` · تلاش ${m.attemptCount}` : ""}
                        {" · "}
                        <button
                          type="button"
                          className="textButton"
                          disabled={pending}
                          onClick={() => {
                            chrome.discardOfflineMutation(m.id);
                            setOfflineItems(readOfflineMutations(window.localStorage));
                          }}
                        >
                          {t("offline.discard")}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="textButton"
                    disabled={pending}
                    onClick={() => {
                      startTransition(() => {
                        void (async () => {
                          await chrome.flushOfflineQueue();
                          setOfflineItems(readOfflineMutations(window.localStorage));
                        })();
                      });
                    }}
                  >
                    {t("offline.retry")}
                  </button>
                </div>
              ) : null}
              {loading ? <ContentSkeleton rows={2} label="در حال بارگذاری اعلان‌ها…" /> : null}
              {error ? (
                <p className="notifPanel__error">
                  {error}{" "}
                  <button type="button" className="textButton" onClick={loadNotifications}>
                    تلاش مجدد
                  </button>
                </p>
              ) : null}
              {actionError ? <p className="notifPanel__error">{actionError}</p> : null}
              {!loading && !error && list.length === 0 ? (
                <EmptyStateBlock
                  sticker="bell"
                  title="اعلانی نیست"
                  description="وقتی رویدادی برای این فضا بیاید اینجا دیده می‌شود."
                />
              ) : null}
              <ul className="notifPanel__list">
                {list.map((notification) => {
                  const slug = chrome?.workspaces.find((w) => w.id === effectiveWorkspaceId)?.slug;
                  const actions = notificationInboxActions(notification);
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        className={`notifItem${notification.readAt ? "" : " notifItem--unread"}`}
                        disabled={pending}
                        onClick={() => handleItemClick(notification)}
                      >
                        <strong>{notification.title}</strong>
                        <span>{notification.body}</span>
                        <time dateTime={notification.createdAt}>{formatWhen(notification.createdAt)}</time>
                      </button>
                      {actions.length > 0 ? (
                        <div className="notifItem__actions">
                          {actions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              className="textButton"
                              disabled={pending}
                              onClick={(e) => {
                                e.stopPropagation();
                                startTransition(() => {
                                  void (async () => {
                                    try {
                                      if (!notification.readAt) {
                                        if (chrome) {
                                          await chrome.markNotificationRead(notification.id);
                                          setItems(chrome.notifications);
                                        } else {
                                          const updated = await api.markNotificationRead(
                                            effectiveWorkspaceId,
                                            notification.id,
                                          );
                                          setItems((prev) =>
                                            prev.map((n) => (n.id === notification.id ? updated : n)),
                                          );
                                        }
                                      }
                                      const href = notificationTargetHref(notification, slug);
                                      if (href) {
                                        setOpen(false);
                                        router.push(href);
                                      }
                                    } catch (err: unknown) {
                                      setActionError(
                                        friendlyErrorMessage(err, "عملیات اعلان ناموفق"),
                                      );
                                    }
                                  })();
                                });
                              }}
                            >
                              {notificationActionLabel(action)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <footer className="notifPanel__foot">
                <Link
                  href="/account/security"
                  className="notifPanel__prefs"
                  onClick={() => setOpen(false)}
                >
                  تنظیم اعلان‌ها
                </Link>
              </footer>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="notifBell">
      <button
        ref={triggerRef}
        type="button"
        className="notifBell__trigger"
        aria-label={aria}
        title={aria}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <ShellIconSvg name="bell" />
        {unreadCount > 0 ? <span className="notifDot" aria-hidden="true" /> : null}
      </button>
      {panel}
    </div>
  );
}
