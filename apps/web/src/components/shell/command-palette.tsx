"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppChrome } from "@/lib/use-app-chrome";
import {
  accountNav,
  bottomTabsV2,
  DOMAIN_GROUP_ORDER,
  expenseFabHref,
  homeDomainHref,
  mosaicItemSummary,
  spaceNav,
} from "@/lib/navigation-v2";
import { listRecentDestinations, rememberDestination } from "@/lib/recent-destinations";
import { spaceNavFlagsFromCapabilities } from "@/lib/workspace-page-access";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  memberStatementHref,
  statementMonthBounds,
  statementsListHref,
} from "@/lib/statement-links";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import { t } from "@/lib/i18n";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  group: string;
  /** Extra searchable text (mosaic summary, etc.) — not shown in the row. */
  haystack?: string;
};

/**
 * Pure fuzzy scorer: subsequence match with consecutive-run bonus.
 * Higher is better; -1 means no match. Works for Persian/Latin labels.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t === q) return 10_000;
  const exactAt = t.indexOf(q);
  if (exactAt >= 0) {
    return 5_000 + Math.max(0, 1_000 - exactAt) - Math.max(0, t.length - q.length);
  }

  let qi = 0;
  let score = 0;
  let consecutive = 0;
  let firstIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstIndex < 0) firstIndex = ti;
      consecutive += 1;
      score += 10 + consecutive * 5;
      if (ti === 0 || /\s/.test(t[ti - 1]!)) score += 15;
      qi += 1;
    } else {
      consecutive = 0;
    }
  }

  if (qi !== q.length) return -1;
  score -= firstIndex;
  score -= Math.max(0, t.length - q.length);
  return score;
}

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
  const panelRef = useRef<HTMLDivElement>(null);
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

    for (const recent of listRecentDestinations()) {
      push({
        id: `recent-${recent.key}`,
        label: recent.label,
        href: recent.href,
        group: t("shell.groupRecent"),
      });
    }

    const fab = expenseFabHref(template, slug);
    if (fab) {
      push({
        id: "fab-expense",
        label: NAV_LABELS.addExpense,
        href: fab,
        group: t("shell.groupShortcut"),
      });
    }
    for (const tab of bottomTabsV2(template, slug)) {
      push({ id: `tab-${tab.key}`, label: tab.label, href: tab.href, group: t("shell.groupShortcut") });
    }
    if (slug) {
      push({
        id: "shortcut-expenses",
        label: NAV_LABELS.expenses,
        href: wPath(slug, "expenses"),
        group: t("shell.groupShortcut"),
        haystack: mosaicItemSummary("expenses"),
      });
      push({
        id: "shortcut-space",
        label: NAV_LABELS.space,
        href: wPath(slug, "space"),
        group: t("shell.groupShortcut"),
      });
      push({
        id: "shortcut-more",
        label: NAV_LABELS.more,
        href: wPath(slug, "more"),
        group: t("shell.groupShortcut"),
      });
      for (const domain of DOMAIN_GROUP_ORDER) {
        push({
          id: `folder-${domain}`,
          label:
            domain === "finance"
              ? NAV_LABELS.sectionFinance
              : domain === "buy"
                ? NAV_LABELS.sectionBuy
                : domain === "people"
                  ? NAV_LABELS.sectionPeople
                  : domain === "oversight"
                    ? NAV_LABELS.sectionOversight
                    : NAV_LABELS.sectionSettings,
          href: homeDomainHref(slug, domain),
          group: NAV_LABELS.home,
          haystack: `پوشه خانه ${domain}`,
        });
      }
      push({
        id: "act-settlements",
        label: NAV_LABELS.settlements,
        href: wPath(slug, "settlements"),
        group: t("shell.groupAction"),
        haystack: mosaicItemSummary("settlements"),
      });
      if (chrome.capabilities?.providers?.statements === "csv_json_print_v1") {
        const me = chrome.actor?.userId;
        if (me) {
          push({
            id: "act-my-statement-month",
            label: NAV_LABELS.myStatementThisMonth,
            href: memberStatementHref(slug, me, statementMonthBounds()),
            group: t("shell.groupAction"),
            haystack: mosaicItemSummary("statements"),
          });
        }
        push({
          id: "act-statements",
          label: NAV_LABELS.statements,
          href: statementsListHref(slug),
          group: t("shell.groupAction"),
          haystack: mosaicItemSummary("statements"),
        });
      }
      push({
        id: "act-members",
        label: NAV_LABELS.members,
        href: wPath(slug, "members"),
        group: t("shell.groupAction"),
        haystack: `${NAV_LABELS.members} ${NAV_LABELS.invite} عضو نقش`,
      });
      push({
        id: "act-settings",
        label: t("shell.settingsSpace"),
        href: wPath(slug, "settings"),
        group: t("shell.groupAction"),
        haystack: mosaicItemSummary("settings"),
      });
    }
    for (const section of spaceNav(
      template,
      slug,
      spaceNavFlagsFromCapabilities(chrome.capabilities),
    )) {
      for (const item of section.items) {
        push({
          id: `nav-${item.key}`,
          label: item.label,
          href: item.href,
          group: section.label,
          haystack: mosaicItemSummary(item.key),
        });
      }
    }
    for (const item of accountNav({
      platformAdminLive:
        chrome.capabilities?.providers?.platformAdmin === "platform_v1",
      platformRole: chrome.platformRole,
    })) {
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
    chrome.capabilities,
    chrome.actor?.userId,
    chrome.platformRole,
    slug,
    template,
    open,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const recentLabel = t("shell.groupRecent");
      const recentFirst = items.filter((item) => item.group === recentLabel);
      const rest = items.filter((item) => item.group !== recentLabel);
      return [...recentFirst, ...rest].slice(0, 20);
    }
    return items
      .map((item) => {
        const labelScore = fuzzyScore(q, item.label);
        const hayScore = item.haystack ? fuzzyScore(q, item.haystack) : -1;
        const score = Math.max(labelScore, hayScore);
        return { item, score };
      })
      .filter((row) => row.score >= 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label, "fa"))
      .slice(0, 20)
      .map((row) => row.item);
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    for (const item of filtered.slice(0, 8)) {
      router.prefetch?.(item.href);
    }
  }, [open, filtered, router]);

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
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ) ?? [],
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
    const match = items.find((item) => item.href === href);
    if (match) {
      rememberDestination({
        key: match.id,
        label: match.label,
        href: match.href,
      });
    }
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
      <div className="cmd-palette__panel" ref={panelRef}>
        <div className="cmd-palette__head">
          <div>
            <h2 id={titleId} className="cmd-palette__title">
              {t("shell.findInDong")}
            </h2>
            <span className="cmd-palette__count" aria-live="polite">
              {t("shell.resultCount", {
                count: filtered.length.toLocaleString("fa-IR"),
              })}
            </span>
          </div>
          <button
            type="button"
            className="cmd-palette__close"
            onClick={() => setOpen(false)}
            aria-label={t("shell.searchClose")}
          >
            ×
          </button>
        </div>
        <input
          ref={inputRef}
          className="cmd-palette__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("shell.searchPlaceholder")}
          role="combobox"
          aria-label={t("shell.searchAria")}
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="cmd-palette-list"
          aria-activedescendant={filtered[active] ? `cmd-palette-${filtered[active].id}` : undefined}
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
            <li className="cmd-palette__empty">{t("shell.noResults")}</li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.id} role="none">
                <button
                  id={`cmd-palette-${item.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`cmd-palette__item${index === active ? " is-active" : ""}`}
                  onClick={() => go(item.href)}
                  onMouseEnter={() => {
                    setActive(index);
                    router.prefetch(item.href);
                  }}
                >
                  <span>{item.label}</span>
                  <small>{item.group}</small>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="cmd-palette__hint">{t("shell.paletteHint")}</p>
      </div>
    </div>
  );
}
