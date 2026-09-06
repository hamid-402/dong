"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { spaceKindForTemplate } from "@dang/contracts";
import { hubPathFor } from "@/lib/hub-links";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";

const KIND_LABEL = {
  personal: "شخصی",
  group: "گروه",
  org: "سازمان",
} as const;

export function WorkspaceSwitcher() {
  const { workspaces, workspaceId, workspaceName, selectWorkspace, ready } = useAppChrome();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

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
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ready) {
    return <span className="mosaic-ws-switch mosaic-ws-switch--loading">…</span>;
  }

  if (workspaces.length === 0) {
    return (
      <Link href={hubPathFor("/onboarding")} className="mosaic-ws-switch mosaic-ws-switch--empty">
        ساخت فضای کاری
      </Link>
    );
  }

  return (
    <div className="mosaic-ws-switch" ref={rootRef}>
      <button
        type="button"
        className="mosaic-ws-switch__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="mosaic-ws-switch__label">فضای کاری</span>
        <strong>{workspaceName || "انتخاب نشده"}</strong>
        <span className="mosaic-ws-switch__chev" aria-hidden>
          ⌄
        </span>
      </button>

      {open ? (
        <ul className="mosaic-ws-switch__menu" id={listId} role="listbox" aria-label="فضاهای کاری">
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
                      <li key={ws.id} role="option" aria-selected={active}>
                        <button
                          type="button"
                          className={`mosaic-ws-switch__option${active ? " is-active" : ""}`}
                          onClick={() => {
                            selectWorkspace(ws.id);
                            setOpen(false);
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
            <Link href={hubPathFor("/onboarding")} onClick={() => setOpen(false)}>
              + فضای کاری جدید
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
