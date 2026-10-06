"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { spaceKindForTemplate } from "@dang/contracts";
import { membershipRoleLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useDisplayUnit } from "@/lib/display-unit";
import { wPath } from "@/lib/workspace-paths";
import {
  buildDirectorySections,
  DIRECTORY_KIND_LABEL,
  DIRECTORY_KIND_ORDER,
  type DirectorySpaceKind,
  type DirectoryWorkspaceRow,
} from "@/lib/workspace-directory-model";
import {
  filterLivePinnedWorkspaces,
  filterLiveRecentWorkspaces,
  isWorkspacePinned,
  listPinnedWorkspaces,
  listRecentWorkspaces,
} from "@/lib/workspace-directory-prefs";
import {
  syncPinnedWorkspacesFromServer,
  togglePinnedWorkspaceSynced,
} from "@/lib/workspace-pin-sync";
import {
  directoryMetricsFor,
  useWorkspaceDirectory,
} from "@/lib/use-workspace-directory";
import { formatDirectoryNetHint } from "@/lib/directory-metric-label";
import { assignKindGems, gemCssVars } from "@/lib/tile-gem-palettes";

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WorkspaceSwitcher({
  compact = false,
}: {
  /** Hide the meta hint under the name (sub-headers). */
  compact?: boolean;
}) {
  const { workspaces, workspaceId, workspaceName, selectWorkspace, ready } =
    useAppChrome();
  const displayUnit = useDisplayUnit();
  const directory = useWorkspaceDirectory({ metrics: false });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pinTick, setPinTick] = useState(0);
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const [expandedKinds, setExpandedKinds] = useState<
    ReadonlySet<DirectorySpaceKind>
  >(() => new Set());
  const [fullyExpandedKinds, setFullyExpandedKinds] = useState<
    ReadonlySet<DirectorySpaceKind>
  >(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchId = useId();
  const optionsListId = useId();
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
  const kindLabel = DIRECTORY_KIND_LABEL[kind];
  const liveIds = useMemo(() => workspaces.map((w) => w.id), [workspaces]);

  const enrichedWorkspaces = useMemo(() => {
    return workspaces.map((ws) => {
      const metrics = directoryMetricsFor(directory.entries, ws.id);
      if (!metrics) return ws;
      return {
        ...ws,
        myRole: ws.myRole ?? metrics.myRole,
      };
    });
  }, [workspaces, directory.entries]);

  const pins = useMemo(() => {
    void pinTick;
    return filterLivePinnedWorkspaces(listPinnedWorkspaces(), liveIds);
  }, [liveIds, pinTick, open]);

  const recent = useMemo(() => {
    void pinTick;
    return filterLiveRecentWorkspaces(listRecentWorkspaces(), liveIds);
  }, [liveIds, pinTick, open]);

  const sections = useMemo(
    () =>
      buildDirectorySections({
        workspaces: enrichedWorkspaces,
        query,
        pins,
        recent,
        expandedKinds,
        fullyExpandedKinds,
        activeKind: inWorkspace ? kind : null,
      }),
    [
      enrichedWorkspaces,
      query,
      pins,
      recent,
      expandedKinds,
      fullyExpandedKinds,
      inWorkspace,
      kind,
    ],
  );

  const spaceGemById = useMemo(() => {
    const idsByKind: Record<DirectorySpaceKind, string[]> = {
      personal: [],
      group: [],
      building: [],
      org: [],
    };
    for (const ws of workspaces) {
      idsByKind[spaceKindForTemplate(ws.template)].push(ws.id);
    }
    const map = new Map<string, string>();
    for (const kind of DIRECTORY_KIND_ORDER) {
      for (const [id, gem] of assignKindGems(kind, idsByKind[kind])) {
        map.set(id, gem);
      }
    }
    return map;
  }, [workspaces]);

  const flatOptions = useMemo(
    () => sections.flatMap((section) => section.rows),
    [sections],
  );

  useEffect(() => {
    if (!ready || liveIds.length === 0) return;
    let cancelled = false;
    void syncPinnedWorkspacesFromServer(liveIds).then(() => {
      if (!cancelled) setPinTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, liveIds]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveOptionId(null);
      return;
    }
    const onPointer = (event: globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === "dang-pinned-workspaces" ||
        event.key === "dang-recent-workspaces"
      ) {
        setPinTick((n) => n + 1);
      }
    };
    const focusTimer = window.setTimeout(() => {
      searchRef.current?.focus();
    }, 0);
    for (const row of flatOptions.slice(0, 8)) {
      router.prefetch?.(wPath(row.slug, "space"));
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("storage", onStorage);
    };
  }, [open, flatOptions, router]);

  useEffect(() => {
    if (!open) return;
    void directory.refresh({ metrics: true });
    // Only when the menu opens — avoid re-fetch loops when entries update.
     
  }, [open]);

  function go(ws: DirectoryWorkspaceRow) {
    selectWorkspace(ws.id);
    setOpen(false);
    router.push(wPath(ws.slug, "space"));
  }

  function onPinClick(workspaceIdToPin: string, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    void togglePinnedWorkspaceSynced(workspaceIdToPin, liveIds).then(() => {
      setPinTick((n) => n + 1);
    });
  }

  function toggleKind(kindKey: DirectorySpaceKind) {
    setExpandedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kindKey)) {
        next.delete(kindKey);
        setFullyExpandedKinds((full) => {
          const cleared = new Set(full);
          cleared.delete(kindKey);
          return cleared;
        });
      } else {
        next.add(kindKey);
      }
      return next;
    });
  }

  function showAllKind(kindKey: DirectorySpaceKind) {
    setExpandedKinds((prev) => new Set(prev).add(kindKey));
    setFullyExpandedKinds((prev) => new Set(prev).add(kindKey));
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" && menuRef.current) {
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
      return;
    }

    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-workspace-option]",
      ),
    );
    if (options.length === 0) return;
    const current = options.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      if (current < 0) {
        options[0]?.focus();
        return;
      }
      options[(current + delta + options.length) % options.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      options[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      options.at(-1)?.focus();
    }
  }

  if (!ready) {
    return (
      <span className="mosaic-ws-switch mosaic-ws-switch--loading">…</span>
    );
  }

  if (workspaces.length === 0) {
    return (
      <Link
        href="/spaces/new"
        className="mosaic-ws-switch mosaic-ws-switch--empty"
      >
        ساخت فضای کاری
      </Link>
    );
  }

  const triggerTitle =
    onAppHub && !inWorkspace ? "خانه" : workspaceName || "انتخاب نشده";
  const triggerMeta =
    onAppHub && !inWorkspace
      ? `${workspaces.length.toLocaleString("fa-IR")} فضا · جستجو یا پین`
      : `${kindLabel}${workspaces.length > 1 ? ` · ${workspaces.length.toLocaleString("fa-IR")} فضا` : ""}`;

  return (
    <div className="mosaic-ws-switch" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="mosaic-ws-switch__trigger"
        aria-haspopup="dialog"
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
        <div
          ref={menuRef}
          className="mosaic-ws-switch__menu mosaic-ws-switch__menu--directory"
          id={listId}
          role="dialog"
          aria-label="فهرست فضاهای کاری"
          onKeyDown={onMenuKeyDown}
        >
          <div className="mosaic-ws-switch__search">
            <label className="visually-hidden" htmlFor={searchId}>
              جستجوی فضا
            </label>
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              className="mosaic-ws-switch__searchInput"
              value={query}
              placeholder="جستجوی نام یا شناسه…"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={optionsListId}
              aria-activedescendant={activeOptionId ?? undefined}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  const first = menuRef.current?.querySelector<HTMLButtonElement>(
                    "[data-workspace-option]",
                  );
                  first?.focus();
                  if (first?.id) setActiveOptionId(first.id);
                } else if (event.key === "Enter" && flatOptions[0]) {
                  event.preventDefault();
                  go(flatOptions[0]);
                }
              }}
            />
            {directory.loading ? (
              <span className="mosaic-ws-switch__dirStatus" aria-live="polite">
                به‌روزرسانی…
              </span>
            ) : directory.error ? (
              <span className="mosaic-ws-switch__dirStatus is-warn" role="status">
                {directory.error}
              </span>
            ) : null}
          </div>

          <ul
            className="mosaic-ws-switch__list"
            id={optionsListId}
            role="listbox"
            aria-label="فضاهای کاری"
          >
            {sections.length === 0 ? (
              <li className="mosaic-ws-switch__emptyQuery" role="presentation">
                فضایی با این جستجو پیدا نشد
              </li>
            ) : (
              sections.map((section) => (
                <li key={section.id} className="mosaic-ws-switch__group">
                  {section.kind ? (
                    <button
                      type="button"
                      className="mosaic-ws-switch__groupToggle"
                      aria-expanded={!section.collapsed}
                      onClick={() => toggleKind(section.kind)}
                    >
                      <span>{section.label}</span>
                      <span aria-hidden>
                        {section.collapsed
                          ? `نمایش ${section.hiddenCount.toLocaleString("fa-IR")}`
                          : "▾"}
                      </span>
                    </button>
                  ) : (
                    <span className="mosaic-ws-switch__groupLabel">
                      {section.label}
                    </span>
                  )}
                  {!section.collapsed || !section.kind ? (
                    <ul>
                      {section.rows.map((ws) => {
                        const selected = inWorkspace && ws.id === workspaceId;
                        const pinned = isWorkspacePinned(ws.id);
                        const metrics = directoryMetricsFor(
                          directory.entries,
                          ws.id,
                        );
                        const netHint = formatDirectoryNetHint(
                          metrics?.myNetMinor,
                          metrics?.openSettlements,
                          displayUnit,
                        );
                        const optionDomId = `${optionsListId}-${ws.id}`;
                        return (
                          <li
                            key={ws.id}
                            role="none"
                            className="mosaic-ws-switch__row"
                          >
                            <button
                              id={optionDomId}
                              data-workspace-option
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`mosaic-ws-switch__option${selected ? " is-active" : ""}`}
                              onClick={() => go(ws)}
                              onFocus={() => setActiveOptionId(optionDomId)}
                              onMouseEnter={() => {
                                setActiveOptionId(optionDomId);
                                router.prefetch?.(wPath(ws.slug, "space"));
                              }}
                            >
                              <span
                                className="mosaic-ws-switch__swatch"
                                style={gemCssVars(spaceGemById.get(ws.id))}
                                aria-hidden
                              />
                              <b>{ws.name}</b>
                              <small>
                                {workspaceTemplateLabel(ws.template)}
                                {ws.archivedAt ? " · بایگانی" : ""}
                                {ws.myRole
                                  ? ` · ${membershipRoleLabel(ws.myRole)}`
                                  : ""}
                                {netHint ? ` · ${netHint}` : ""}
                              </small>
                            </button>
                            <button
                              type="button"
                              className={`mosaic-ws-switch__pin${pinned ? " is-on" : ""}`}
                              aria-label={
                                pinned
                                  ? `برداشتن پین ${ws.name}`
                                  : `پین کردن ${ws.name}`
                              }
                              aria-pressed={pinned}
                              onClick={(event) => onPinClick(ws.id, event)}
                            >
                              {pinned ? "★" : "☆"}
                            </button>
                          </li>
                        );
                      })}
                      {section.kind &&
                      !section.collapsed &&
                      section.hiddenCount > 0 ? (
                        <li role="none">
                          <button
                            type="button"
                            className="mosaic-ws-switch__more"
                            onClick={() => showAllKind(section.kind)}
                          >
                            نمایش همهٔ{" "}
                            {(
                              section.rows.length + section.hiddenCount
                            ).toLocaleString("fa-IR")}{" "}
                            فضا
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              ))
            )}
            <li className="mosaic-ws-switch__footer">
              <Link href="/home" onClick={() => setOpen(false)}>
                خانه
              </Link>
              <Link href="/spaces/new" onClick={() => setOpen(false)}>
                + فضای کاری جدید
              </Link>
              <Link href="/home" onClick={() => setOpen(false)}>
                همه فضاها
              </Link>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
