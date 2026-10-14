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
import { createPortal } from "react-dom";
import {
  spaceKindForTemplate,
  type SpaceKind,
  type WorkspaceTemplate,
} from "@dang/contracts";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { t } from "@/lib/i18n";
import { useAppChrome } from "@/lib/use-app-chrome";
import { workspaceDisplayName } from "@/lib/workspace-display-name";
import { spacesListHref, wPath } from "@/lib/workspace-paths";
import { slugFromPathname } from "@/lib/workspace-storage";

/** شخصی، گروهی، سازمان، ساختمان. */
export const SPACE_PANEL_KINDS = ["personal", "group", "org", "building"] as const;

const FOCUSABLE =
  'a[href], button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

type SpaceRow = {
  id: string;
  name: string;
  slug: string;
  template: WorkspaceTemplate;
  archivedAt?: string | null;
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

/**
 * Bar label: «نوع · نام» inside a space, the kind on a kind list, «همه فضاها» on /home.
 */
export function spaceSwitchTriggerLabel(input: {
  pathname: string;
  kind: SpaceKind | null;
  inWorkspace: boolean;
  spaceName: string | null;
}): string {
  const path = barePath(input.pathname);
  const kindLabel = input.kind ? spaceTabLabel(input.kind) : null;
  if (input.inWorkspace) {
    if (kindLabel && input.spaceName) return `${kindLabel} · ${input.spaceName}`;
    if (kindLabel) return kindLabel;
  }
  const kindList = path === "/spaces" || path === "/home";
  if (kindList && kindLabel) return kindLabel;
  return "همه فضاها";
}

function useBottomSheet(): boolean {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(max-width: 480px)");
    const apply = () => setSheet(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return sheet;
}

export function ShellSpaceSwitcher({
  leaveHref = null,
}: {
  /** Danger-zone leave target. Omitted outside a leavable space. */
  leaveHref?: string | null;
}) {
  const { workspaces, workspaceId, selectWorkspace, ready } = useAppChrome();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const sheet = useBottomSheet();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelKind, setPanelKind] = useState<SpaceKind>("personal");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const searchId = useId();
  const listId = useId();

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
  const label = spaceSwitchTriggerLabel({
    pathname,
    kind: locationKind,
    inWorkspace,
    spaceName: inWorkspace && rawSpaceName
      ? workspaceDisplayName(rawSpaceName, routeWorkspace?.template ?? active?.template)
      : null,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return workspaces.filter((ws) => {
      if (spaceKindForTemplate(ws.template) !== panelKind) return false;
      if (!q) return true;
      return `${ws.name} ${ws.slug}`.toLowerCase().includes(q);
    });
  }, [workspaces, panelKind, query]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  function reveal() {
    setPanelKind(locationKind ?? "personal");
    setQuery("");
    setOpen((value) => !value);
  }

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(ws: SpaceRow) {
    selectWorkspace(ws.id);
    setOpen(false);
    router.push(wPath(ws.slug, "space"));
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab" && panelRef.current) {
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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

    const tabs = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-kind-tab]") ?? [],
    );
    const tabIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (tabIndex >= 0 && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      let next = tabIndex;
      if (event.key === "ArrowLeft") next = (tabIndex - 1 + tabs.length) % tabs.length;
      else if (event.key === "ArrowRight") next = (tabIndex + 1) % tabs.length;
      else if (event.key === "Home") next = 0;
      else next = tabs.length - 1;
      const kind = asKind(tabs[next]?.dataset.kind ?? null);
      if (kind) setPanelKind(kind);
      tabs[next]?.focus();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    const options = Array.from(
      panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-space-option]") ?? [],
    );
    if (options.length === 0) return;
    const onSearch = document.activeElement === searchRef.current;
    const onTab = tabIndex >= 0;
    const onOption = options.includes(document.activeElement as HTMLButtonElement);
    if (!onSearch && !onTab && !onOption) return;
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

  const panel = open ? (
    <div
      ref={panelRef}
      id={panelId}
      className={`shell-spacePanel${sheet ? " shell-spacePanel--sheet" : ""}`}
      role="dialog"
      aria-label="فهرست فضاهای کاری"
      onKeyDown={onPanelKeyDown}
    >
      <div className="shell-spacePanel__tabs" role="tablist" aria-label={t("shell.kindTabsAria")}>
        {SPACE_PANEL_KINDS.map((kind) => {
          const selected = kind === panelKind;
          return (
            <button
              key={kind}
              type="button"
              role="tab"
              data-kind-tab=""
              data-kind={kind}
              className={`shell-spacePanel__tab${selected ? " is-active" : ""}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setPanelKind(kind)}
            >
              {spaceTabLabel(kind)}
            </button>
          );
        })}
      </div>
      <div className="shell-spacePanel__body" role="tabpanel">
        <label className="visually-hidden" htmlFor={searchId}>
          جستجوی فضا
        </label>
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          className="shell-spacePanel__search"
          value={query}
          placeholder="جستجوی نام یا شناسه…"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && rows[0]) {
              event.preventDefault();
              go(rows[0]);
            }
          }}
        />
        <ul className="shell-spacePanel__list" id={listId} role="listbox" aria-label="فضاهای کاری">
          {rows.length === 0 ? (
            <li className="shell-spacePanel__empty" role="presentation">
              {query.trim() ? "فضایی با این جستجو پیدا نشد" : "فضایی از این نوع نیست"}
            </li>
          ) : (
            rows.map((ws) => {
              const selected = inWorkspace && ws.id === (routeWorkspace?.id ?? workspaceId);
              const name = workspaceDisplayName(ws.name, ws.template);
              return (
                <li key={ws.id} role="none">
                  <button
                    type="button"
                    role="option"
                    data-space-option=""
                    className={`shell-spacePanel__option${selected ? " is-active" : ""}`}
                    aria-selected={selected}
                    onClick={() => go(ws)}
                  >
                    <span>{name}</span>
                    {ws.archivedAt ? <small>بایگانی</small> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className="shell-spacePanel__footer">
          <Link href={spacesListHref(panelKind)} onClick={() => setOpen(false)}>
            همه‌ی فضاهای این نوع
          </Link>
          <Link href="/spaces" onClick={() => setOpen(false)}>
            همه فضاها
          </Link>
          <Link href={`/spaces/new?kind=${panelKind}`} onClick={() => setOpen(false)}>
            {NAV_LABELS.createSpace}
          </Link>
          {inWorkspace && leaveHref ? (
            <Link
              href={leaveHref}
              className="shell-spacePanel__leave"
              aria-label={t("shell.leaveSpaceAria")}
              onClick={() => setOpen(false)}
            >
              خروج از فضا
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="shell-spaceSwitch" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="shell-spaceSwitch__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={!ready}
        title={label}
        onClick={reveal}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setPanelKind(locationKind ?? "personal");
            setQuery("");
            setOpen(true);
          }
        }}
      >
        <span className="shell-spaceSwitch__label">{label}</span>
        <ShellIconSvg name="chevron" size={20} />
      </button>
      {sheet && open ? (
        <>
          {typeof document !== "undefined"
            ? createPortal(
                <button
                  type="button"
                  className="shell-spacePanel__backdrop"
                  aria-label="بستن"
                  onClick={() => close(true)}
                />,
                document.body,
              )
            : null}
          {typeof document !== "undefined" ? createPortal(panel, document.body) : panel}
        </>
      ) : (
        panel
      )}
    </div>
  );
}
