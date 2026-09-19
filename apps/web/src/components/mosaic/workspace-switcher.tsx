"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { spaceKindForTemplate } from "@dang/contracts";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

const KIND_LABEL = {
  personal: "شخصی",
  group: "گروه",
  building: "ساختمان",
  org: "سازمان",
} as const;

const FOCUSABLE =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function WorkspaceSwitcher({
  compact = false,
}: {
  /** Hide the meta hint under the name (sub-headers). */
  compact?: boolean;
}) {
  const { workspaces, workspaceId, workspaceName, selectWorkspace, ready } = useAppChrome();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const router = useRouter();
  const pathname = usePathname();
  const inWorkspace = /^\/w\//.test(pathname);
  const onAppHub =
    pathname === "/home" ||
    pathname.startsWith("/spaces") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/me");

  const active = workspaces.find((w) => w.id === workspaceId);
  const kind = spaceKindForTemplate(active?.template);
  const kindLabel = KIND_LABEL[kind];

  const grouped = useMemo(() => {
    const buckets: Record<"personal" | "group" | "building" | "org", typeof workspaces> = {
      personal: [],
      group: [],
      building: [],
      org: [],
    };
    for (const ws of workspaces) {
      buckets[spaceKindForTemplate(ws.template)].push(ws);
    }
    return buckets;
  }, [workspaces]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = Array.from(
        menuRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
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
    };
    const focusTimer = window.setTimeout(() => {
      const selected = menuRef.current?.querySelector<HTMLButtonElement>(
        '[data-workspace-option][aria-selected="true"]',
      );
      const first = menuRef.current?.querySelector<HTMLButtonElement>(
        "[data-workspace-option]",
      );
      (selected ?? first)?.focus();
    }, 0);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ready) {
    return <span className="mosaic-ws-switch mosaic-ws-switch--loading">…</span>;
  }

  if (workspaces.length === 0) {
    return (
      <Link href="/spaces/new" className="mosaic-ws-switch mosaic-ws-switch--empty">
        ساخت فضای کاری
      </Link>
    );
  }

  const triggerTitle =
    onAppHub && !inWorkspace
      ? "خانه"
      : workspaceName || "انتخاب نشده";
  const triggerMeta =
    onAppHub && !inWorkspace
      ? `${workspaces.length.toLocaleString("fa-IR")} فضا · انتخاب از تب‌ها`
      : `${kindLabel}${workspaces.length > 1 ? ` · ${workspaces.length.toLocaleString("fa-IR")} فضا` : ""}`;

  return (
    <div className="mosaic-ws-switch" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="mosaic-ws-switch__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={
          onAppHub && !inWorkspace
            ? "خانه — فهرست فضاها"
            : `فضای کاری فعال: ${workspaceName || "انتخاب نشده"}`
        }
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="mosaic-ws-switch__label">{triggerMeta}</span>
        <strong>{triggerTitle}</strong>
        {!compact ? (
          <span className="mosaic-ws-switch__hint" aria-hidden>
            {onAppHub && !inWorkspace ? "باز کردن فضا" : "تعویض فضا"}
          </span>
        ) : null}
        <span className="mosaic-ws-switch__chev" aria-hidden>
          ⌄
        </span>
      </button>

      {open ? (
        <ul
          ref={menuRef}
          className="mosaic-ws-switch__menu"
          id={listId}
          role="listbox"
          aria-label="فضاهای کاری"
          onKeyDown={(event) => {
            const options = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "[data-workspace-option]",
              ),
            );
            const current = options.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const delta = event.key === "ArrowDown" ? 1 : -1;
              options[(current + delta + options.length) % options.length]?.focus();
            } else if (event.key === "Home") {
              event.preventDefault();
              options[0]?.focus();
            } else if (event.key === "End") {
              event.preventDefault();
              options.at(-1)?.focus();
            }
          }}
        >
          {(["personal", "group", "building", "org"] as const).map((kind) => {
            const list = grouped[kind];
            if (list.length === 0) return null;
            return (
              <li key={kind} className="mosaic-ws-switch__group">
                <span className="mosaic-ws-switch__groupLabel">{KIND_LABEL[kind]}</span>
                <ul>
                  {list.map((ws) => {
                    const selected = inWorkspace && ws.id === workspaceId;
                    return (
                      <li key={ws.id} role="none">
                        <button
                          data-workspace-option
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={`mosaic-ws-switch__option${selected ? " is-active" : ""}`}
                          onClick={() => {
                            selectWorkspace(ws.id);
                            setOpen(false);
                            router.push(wPath(ws.slug, "space"));
                          }}
                        >
                          <b>{ws.name}</b>
                          <small>{workspaceTemplateLabel(ws.template)}</small>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
          <li className="mosaic-ws-switch__footer">
            <Link href="/home" onClick={() => setOpen(false)}>
              خانه
            </Link>
            <Link href="/spaces/new" onClick={() => setOpen(false)}>
              + فضای کاری جدید
            </Link>
            <Link href="/spaces" onClick={() => setOpen(false)}>
              همه فضاها
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
