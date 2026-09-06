"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NotificationSummary } from "@dang/contracts";
import { ShellIconSvg } from "@/components/app-shell";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { notificationTargetHref } from "@/lib/notification-routes";
import { useOptionalAppChrome } from "@/lib/use-app-chrome";

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type NotificationBellProps = {
  workspaceId?: string;
  /** Standalone mode when AppChromeProvider is absent. */
  initialUnreadCount?: number;
};

export function NotificationBell({ workspaceId, initialUnreadCount = 0 }: NotificationBellProps) {
  const router = useRouter();
  const chrome = useOptionalAppChrome();
  const effectiveWorkspaceId = workspaceId ?? chrome?.workspaceId ?? "";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const unreadCount = chrome
    ? chrome.unreadCount
    : items.length > 0
      ? items.filter((n) => !n.readAt).length
      : initialUnreadCount;

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
      return;
    }
    loadNotifications();
  }, [open, effectiveWorkspaceId, chrome, chrome?.notifications]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

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
          const href = notificationTargetHref(notification);
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

  return (
    <div className="notifBell" ref={rootRef}>
      <button
        type="button"
        className="notifBell__trigger"
        aria-label="اعلان‌ها"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ShellIconSvg name="bell" />
        {unreadCount > 0 ? <span className="notifDot" aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="notifPanel" role="dialog" aria-label="اعلان‌ها">
          <header className="notifPanel__head">
            <b>اعلان‌ها</b>
            {unreadCount > 0 ? <span className="notifPanel__count">{unreadCount} خوانده‌نشده</span> : null}
          </header>
          {loading ? <p className="notifPanel__empty">در حال بارگذاری…</p> : null}
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
            <p className="notifPanel__empty">اعلانی نیست.</p>
          ) : null}
          <ul className="notifPanel__list">
            {list.map((notification) => (
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
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
