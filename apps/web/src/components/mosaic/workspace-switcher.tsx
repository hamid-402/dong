"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { spaceKindForTemplate } from "@dang/contracts";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

const KIND_LABEL = {
  personal: "شخصی",
  group: "گروه",
  org: "سازمان",
} as const;

export function WorkspaceSwitcher() {
  const { workspaces, workspaceId, workspaceName, selectWorkspace, ready } = useAppChrome();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const router = useRouter();

  const grouped = useMemo(() => {
    const buckets: Record<"personal" | "group" | "org", typeof workspaces> = {
      personal: [],
      group: [],
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
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const focusTimer = window.setTimeout(() => {
      const selected = rootRef.current?.querySelector<HTMLButtonElement>(
        '[data-workspace-option][aria-selected="true"]',
      );
      const first = rootRef.current?.querySelector<HTMLButtonElement>(
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

  return (
    <div className="mosaic-ws-switch" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="mosaic-ws-switch__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="mosaic-ws-switch__label">فضای کاری</span>
        <strong>{workspaceName || "انتخاب نشده"}</strong>
        <span className="mosaic-ws-switch__chev" aria-hidden>
          ⌄
        </span>
      </button>

      {open ? (
        <ul
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
          {(["personal", "group", "org"] as const).map((kind) => {
            const list = grouped[kind];
            if (list.length === 0) return null;
            return (
              <li key={kind} className="mosaic-ws-switch__group">
                <span className="mosaic-ws-switch__groupLabel">{KIND_LABEL[kind]}</span>
                <ul>
                  {list.map((ws) => {
                    const active = ws.id === workspaceId;
                    return (
                      <li key={ws.id} role="none">
                        <button
                          data-workspace-option
                          type="button"
                          role="option"
                          aria-selected={active}
                          className={`mosaic-ws-switch__option${active ? " is-active" : ""}`}
                          onClick={() => {
                            selectWorkspace(ws.id);
                            setOpen(false);
                            router.push(wPath(ws.slug));
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
