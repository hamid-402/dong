"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  spaceKindForTemplate,
  type SpaceKind,
  type WorkspaceTemplate,
} from "@dang/contracts";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { kindTabVisualState } from "@/components/shell/space-kind-header-tabs";
import { SPACE_PANEL_KINDS } from "@/components/shell/shell-space-switcher";
import { spaceTabLabel } from "@/lib/nav-labels";
import { membershipRoleLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { workspaceDisplayName } from "@/lib/workspace-display-name";
import { spacesListHref, wPath } from "@/lib/workspace-paths";
import { slugFromPathname } from "@/lib/workspace-storage";

const FOCUSABLE =
  'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Org / building kind menus stay list + overview only (sections on hold). */
const SIMPLE_KINDS = new Set<SpaceKind>(["org", "building"]);

type SpaceRow = {
  id: string;
  name: string;
  slug: string;
  template: WorkspaceTemplate;
  archivedAt?: string | null;
  myRole?: string | null;
};

function asKind(value: string | null): SpaceKind | null {
  if (value === "personal" || value === "group" || value === "org" || value === "building") {
    return value;
  }
  return null;
}

function barePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Button caption: kind label, plus current space name when that kind is active. */
export function kindHeaderTriggerLabel(input: {
  kind: SpaceKind;
  activeKind: SpaceKind | null;
  inWorkspace: boolean;
  spaceName: string | null;
}): string {
  const kindLabel = spaceTabLabel(input.kind);
  if (
    input.inWorkspace &&
    input.activeKind === input.kind &&
    input.spaceName
  ) {
    return `${kindLabel} · ${input.spaceName}`;
  }
  return kindLabel;
}

/** Small secondary line from chrome fields only — no extra fetches. */
export function kindHeaderSpaceSummary(ws: SpaceRow): string | null {
  const bits: string[] = [];
  if (ws.archivedAt) bits.push("بایگانی");
  if (ws.myRole) {
    const role = membershipRoleLabel(ws.myRole);
    if (role) bits.push(role);
  }
  return bits.length > 0 ? bits.join(" · ") : null;
}

export function ShellKindHeaderSwitcher() {
  const { workspaces, workspaceId, selectWorkspace, ready } = useAppChrome();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [openKind, setOpenKind] = useState<SpaceKind | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<SpaceKind, HTMLButtonElement | null>>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId();

  const path = barePath(pathname);
  const routeSlug = slugFromPathname(pathname);
  const inWorkspace = Boolean(routeSlug) && path.startsWith("/w/");
  const routeWorkspace = inWorkspace
    ? workspaces.find((ws) => ws.slug === routeSlug)
    : undefined;
  const active = workspaces.find((ws) => ws.id === workspaceId) ?? routeWorkspace;
  const locationKind = inWorkspace
    ? spaceKindForTemplate(routeWorkspace?.template ?? active?.template)
    : asKind(searchParams?.get("kind") ?? null);
  const rawSpaceName = (routeWorkspace?.name ?? active?.name ?? "").trim();
  const spaceName =
    inWorkspace && rawSpaceName
      ? workspaceDisplayName(
          rawSpaceName,
          routeWorkspace?.template ?? active?.template,
        )
      : null;
  const kindQuery = searchParams?.get("kind") ?? null;
  const newKindQuery =
    path === "/spaces/new" || path.startsWith("/spaces/new/")
      ? (searchParams?.get("kind") ?? null)
      : null;

  const kindCounts = useMemo(() => {
    const counts = { personal: 0, group: 0, org: 0, building: 0 } as Record<
      SpaceKind,
      number
    >;
    for (const ws of workspaces) {
      counts[spaceKindForTemplate(ws.template)] += 1;
    }
    return counts;
  }, [workspaces]);

  const rows = useMemo(() => {
    if (!openKind) return [] as SpaceRow[];
    const q = query.trim().toLowerCase();
    return workspaces.filter((ws) => {
      if (spaceKindForTemplate(ws.template) !== openKind) return false;
      if (!q) return true;
      return `${ws.name} ${ws.slug}`.toLowerCase().includes(q);
    });
  }, [workspaces, openKind, query]);

  const showSearch = openKind != null && kindCounts[openKind] > 6;

  function close(restoreFocus = true) {
    const prev = openKind;
    setOpenKind(null);
    setQuery("");
    if (restoreFocus && prev) triggerRefs.current[prev]?.focus();
  }

  function toggle(kind: SpaceKind) {
    if (openKind === kind) {
      close(false);
      return;
    }
    setQuery("");
    setOpenKind(kind);
  }

  useEffect(() => {
    setOpenKind(null);
    setQuery("");
  }, [pathname]);

  useEffect(() => {
    if (!openKind) return;
    const kind = openKind;
    const focusTimer = window.setTimeout(() => {
      if (showSearch) searchRef.current?.focus();
      else {
        const first = panelRef.current?.querySelector<HTMLElement>(
          "[data-space-option], a[href]",
        );
        first?.focus();
      }
    }, 0);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpenKind(null);
      setQuery("");
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpenKind(null);
      setQuery("");
      triggerRefs.current[kind]?.focus();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [openKind, showSearch]);

  function go(ws: SpaceRow) {
    selectWorkspace(ws.id);
    setOpenKind(null);
    setQuery("");
    router.push(wPath(ws.slug));
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" && panelRef.current) {
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
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

    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const options = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-space-option]") ??
        [],
    );
    if (options.length === 0) return;
    const onSearch = document.activeElement === searchRef.current;
    const onOption = options.includes(document.activeElement as HTMLButtonElement);
    if (!onSearch && !onOption) return;
    event.preventDefault();
    if (event.key === "Home") {
      options[0]?.focus();
      return;
    }
    if (event.key === "End") {
      options.at(-1)?.focus();
      return;
    }
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    if (current < 0) {
      (event.key === "ArrowUp" ? options.at(-1) : options[0])?.focus();
      return;
    }
    const delta = event.key === "ArrowDown" ? 1 : -1;
    options[(current + delta + options.length) % options.length]?.focus();
  }

  const panel =
    openKind != null ? (
      <div
        ref={panelRef}
        id={`${baseId}-${openKind}-panel`}
        className="shell-kindSwitch__panel"
        role="dialog"
        aria-label={`فضاهای ${spaceTabLabel(openKind)}`}
        onKeyDown={onPanelKeyDown}
      >
        {showSearch ? (
          <>
            <label className="visually-hidden" htmlFor={`${baseId}-search`}>
              جستجوی فضا
            </label>
            <input
              ref={searchRef}
              id={`${baseId}-search`}
              type="search"
              className="shell-kindSwitch__search"
              value={query}
              placeholder="جستجوی نام یا شناسه…"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={`${baseId}-list`}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && rows[0]) {
                  event.preventDefault();
                  go(rows[0]);
                }
              }}
            />
          </>
        ) : null}
        <ul
          className="shell-kindSwitch__list"
          id={`${baseId}-list`}
          role="listbox"
          aria-label={`فضاهای ${spaceTabLabel(openKind)}`}
        >
          {rows.length === 0 ? (
            <li className="shell-kindSwitch__empty" role="presentation">
              {query.trim() ? "فضایی با این جستجو پیدا نشد" : "فضایی از این نوع نیست"}
            </li>
          ) : (
            rows.map((ws) => {
              const selected =
                inWorkspace && ws.id === (routeWorkspace?.id ?? workspaceId);
              const name = workspaceDisplayName(ws.name, ws.template);
              const summary = kindHeaderSpaceSummary(ws);
              return (
                <li key={ws.id} role="none">
                  <button
                    type="button"
                    role="option"
                    data-space-option=""
                    className={`shell-kindSwitch__option${selected ? " is-active" : ""}`}
                    aria-selected={selected}
                    onClick={() => go(ws)}
                  >
                    <span className="shell-kindSwitch__optionMain">
                      <span>{name}</span>
                      {summary ? <small>{summary}</small> : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="shell-kindSwitch__footer">
          <Link href={spacesListHref(openKind)} onClick={() => close(false)}>
            همه‌ی فضاها
          </Link>
          <Link
            href={`/spaces/reports?kind=${openKind}&months=6`}
            onClick={() => close(false)}
          >
            {`داشبورد همه‌ی ${spaceTabLabel(openKind)}`}
          </Link>
          {!SIMPLE_KINDS.has(openKind) ? (
            <Link
              href={`/spaces/new?kind=${openKind}`}
              onClick={() => close(false)}
            >
              ساخت فضای جدید
            </Link>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <div className="shell-kindSwitch" ref={rootRef} role="group" aria-label="انواع فضا">
      {SPACE_PANEL_KINDS.map((kind) => {
        const visual = kindTabVisualState({
          tabKey: kind,
          pathname,
          homeHref: "/home",
          kindQuery,
          newKindQuery,
          workspaceKind: locationKind,
          onWorkspace: inWorkspace,
        });
        const active =
          visual === "list-active" || visual === "current-realm";
        const label = kindHeaderTriggerLabel({
          kind,
          activeKind: locationKind,
          inWorkspace,
          spaceName,
        });
        const open = openKind === kind;
        const panelId = `${baseId}-${kind}-panel`;
        return (
          <div key={kind} className="shell-kindSwitch__item">
            <button
              ref={(node) => {
                triggerRefs.current[kind] = node;
              }}
              type="button"
              className={`shell-kindSwitch__trigger${active ? " is-active" : ""}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? panelId : undefined}
              disabled={!ready}
              title={label}
              onClick={() => toggle(kind)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !open) {
                  event.preventDefault();
                  setQuery("");
                  setOpenKind(kind);
                }
                if (
                  (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                  !open
                ) {
                  event.preventDefault();
                  const idx = SPACE_PANEL_KINDS.indexOf(kind);
                  // RTL: ArrowLeft moves visually left = next index
                  const delta = event.key === "ArrowLeft" ? 1 : -1;
                  const nextIdx =
                    (idx + delta + SPACE_PANEL_KINDS.length) %
                    SPACE_PANEL_KINDS.length;
                  const next = SPACE_PANEL_KINDS[nextIdx];
                  if (next) triggerRefs.current[next]?.focus();
                }
              }}
            >
              <span className="shell-kindSwitch__label">{label}</span>
              <ShellIconSvg name="chevron" size={16} />
            </button>
            {open ? panel : null}
          </div>
        );
      })}
    </div>
  );
}
