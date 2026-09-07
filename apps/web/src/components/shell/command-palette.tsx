"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppChrome } from "@/lib/use-app-chrome";
import {
  accountNav,
  bottomTabsV2,
  expenseFabHref,
  spaceNav,
} from "@/lib/navigation-v2";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useShellV2Api } from "@/components/shell/shell-v2-context";

type PaletteItem = { id: string; label: string; href: string; group: string };

/**
 * Ctrl/Cmd+K command palette — focus trap, Esc close, aria modal.
 * Open via keyboard or shell header «جستجو» (useShellV2Api.openCommandPalette).
 */
export function CommandPalette() {
  const shell = useShellV2Api();
  const open = shell?.commandPaletteOpen ?? false;
  const setOpen = shell?.setCommandPaletteOpen ?? (() => undefined);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const router = useRouter();
  const chrome = useAppChrome();
  const activeWs = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = activeWs?.slug ?? null;
  const template = activeWs?.template;

  const items = useMemo(() => {
    const list: PaletteItem[] = [];
    const seen = new Set<string>();
    const push = (item: PaletteItem) => {
      if (seen.has(item.href)) return;
      seen.add(item.href);
      list.push(item);
    };

    const fab = expenseFabHref(template, slug);
    if (fab) {
      push({
        id: "fab-expense",
        label: NAV_LABELS.addExpense,
        href: fab,
        group: "میانبر",
      });
    }
    for (const tab of bottomTabsV2(template, slug)) {
      push({ id: `tab-${tab.key}`, label: tab.label, href: tab.href, group: "میانبر" });
    }
    if (slug) {
      push({
        id: "act-settlements",
        label: NAV_LABELS.settlements,
        href: wPath(slug, "settlements"),
        group: "اقدام",
      });
      push({
        id: "act-members",
        label: NAV_LABELS.invite,
        href: wPath(slug, "members"),
        group: "اقدام",
      });
      push({
        id: "act-settings",
        label: "تنظیمات فضا",
        href: wPath(slug, "settings"),
        group: "اقدام",
      });
    }
    for (const section of spaceNav(template, slug, chrome.capabilities?.productFlags)) {
      for (const item of section.items) {
        push({
          id: `nav-${item.key}`,
          label: item.label,
          href: item.href,
          group: section.label,
        });
      }
    }
    for (const item of accountNav()) {
      push({
        id: `acc-${item.key}`,
        label: item.label,
        href: item.href,
        group: NAV_LABELS.sectionAccount,
      });
    }
    for (const ws of chrome.workspaces) {
      push({
        id: `ws-${ws.id}`,
        label: ws.name,
        href: wPath(ws.slug),
        group: NAV_LABELS.spacesList,
      });
    }
    return list;
  }, [
    chrome.workspaces,
    chrome.capabilities?.productFlags,
    slug,
    template,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 20);
    return items.filter((item) => item.label.toLowerCase().includes(q)).slice(0, 20);
  }, [items, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        shell?.setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shell]);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, setOpen]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div
      className="cmd-palette"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="cmd-palette__panel">
        <h2 id={titleId} className="cmd-palette__title">
          یافتن
        </h2>
        <input
          ref={inputRef}
          className="cmd-palette__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="صفحه، فضا یا اکشن…"
          aria-autocomplete="list"
          aria-controls="cmd-palette-list"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              go(filtered[active].href);
            }
          }}
        />
        <ul id="cmd-palette-list" className="cmd-palette__list" role="listbox">
          {filtered.length === 0 ? (
            <li className="cmd-palette__empty">موردی پیدا نشد</li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={`cmd-palette__item${index === active ? " is-active" : ""}`}
                  onClick={() => go(item.href)}
                  onMouseEnter={() => setActive(index)}
                >
                  <span>{item.label}</span>
                  <small>{item.group}</small>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="cmd-palette__hint">Ctrl+K · Esc برای بستن</p>
      </div>
    </div>
  );
}
