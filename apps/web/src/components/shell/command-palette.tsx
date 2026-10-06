"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceMembershipRole } from "@/lib/use-workspace-membership-role";
import {
  accountNav,
  bottomTabsV2,
  DOMAIN_GROUP_ORDER,
  expenseFabHref,
  homeDomainHref,
  mosaicItemSummary,
  spaceNav,
} from "@/lib/navigation-v2";
import { isReadOnlyRole, roleAllowsNavKey, spaceKindForTemplate } from "@dang/contracts";
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
import { fuzzyScore } from "@/lib/fuzzy-score";
import { parseDirectoryQuery } from "@/lib/directory-query";
import { DIRECTORY_KIND_LABEL } from "@/lib/workspace-directory-model";
import {
  filterLivePinnedWorkspaces,
  filterLiveRecentWorkspaces,
  listPinnedWorkspaces,
  listRecentWorkspaces,
} from "@/lib/workspace-directory-prefs";
import { api } from "@/lib/api";
import type { WorkspaceSubunitSummary } from "@dang/contracts";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  group: string;
  /** Extra searchable text (mosaic summary, etc.) — not shown in the row. */
  haystack?: string;
  /** Finder channel for prefix filters. */
  channel?: "space" | "page" | "action" | "subunit";
};

/** @deprecated Import from `@/lib/fuzzy-score` — re-export for existing tests. */
export { fuzzyScore } from "@/lib/fuzzy-score";

const PER_GROUP_CAP = 8;
const RESULT_CAP = 24;

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
  const [subunits, setSubunits] = useState<WorkspaceSubunitSummary[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const router = useRouter();
  const chrome = useAppChrome();
  const { role: membershipRole } = useWorkspaceMembershipRole(chrome.workspaceId);
  const activeWs = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const slug = activeWs?.slug ?? null;
  const template = activeWs?.template;
  const spaceKind = spaceKindForTemplate(template);

  useEffect(() => {
    if (!open || !chrome.workspaceId) {
      setSubunits([]);
      return;
    }
    if (spaceKind !== "building" && spaceKind !== "org") {
      setSubunits([]);
      return;
    }
    let cancelled = false;
    void api
      .listSubunits(chrome.workspaceId)
      .then((rows) => {
        if (!cancelled) setSubunits(rows);
      })
      .catch(() => {
        if (!cancelled) setSubunits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, chrome.workspaceId, spaceKind]);

  const items = useMemo(() => {
    const list: PaletteItem[] = [];
    const seen = new Set<string>();
    const push = (item: PaletteItem) => {
      if (seen.has(item.href)) return;
      seen.add(item.href);
      list.push(item);
    };

    const liveIds = chrome.workspaces.map((w) => w.id);
    for (const pin of filterLivePinnedWorkspaces(listPinnedWorkspaces(), liveIds)) {
      const ws = chrome.workspaces.find((w) => w.id === pin.workspaceId);
      if (!ws) continue;
      push({
        id: `pin-ws-${ws.id}`,
        label: ws.name,
        href: wPath(ws.slug),
        group: "پین‌شده",
        channel: "space",
        haystack: `${ws.slug} ${DIRECTORY_KIND_LABEL[spaceKindForTemplate(ws.template)]}`,
      });
    }
    for (const recent of filterLiveRecentWorkspaces(listRecentWorkspaces(), liveIds)) {
      const ws = chrome.workspaces.find((w) => w.id === recent.workspaceId);
      if (!ws) continue;
      push({
        id: `recent-ws-${ws.id}`,
        label: ws.name,
        href: wPath(ws.slug),
        group: t("shell.groupRecent"),
        channel: "space",
        haystack: `${ws.slug} ${DIRECTORY_KIND_LABEL[spaceKindForTemplate(ws.template)]}`,
      });
    }

    for (const recent of listRecentDestinations()) {
      push({
        id: `recent-${recent.key}`,
        label: recent.label,
        href: recent.href,
        group: t("shell.groupRecent"),
        channel: "page",
      });
    }

    const fab =
      isReadOnlyRole(membershipRole) ? null : expenseFabHref(template, slug);
    if (fab) {
      push({
        id: "fab-expense",
        label: NAV_LABELS.addExpense,
        href: fab,
        group: t("shell.groupShortcut"),
        channel: "action",
        haystack: `${NAV_LABELS.addExpense} ثبت پول انتخابگر`,
      });
    }
    if (slug && !isReadOnlyRole(membershipRole)) {
      const kind = spaceKindForTemplate(template);
      if (kind !== "personal") {
        push({
          id: "job-daily-entry",
          label: `${NAV_LABELS.dailyEntry} · تیک مصرف`,
          href: wPath(slug, "ledger"),
          group: t("shell.groupShortcut"),
          channel: "action",
          haystack: `${NAV_LABELS.dailyEntry} تیک روز عضو مصرف تکراری دفتر`,
        });
      }
      push({
        id: "job-full-expense",
        label: `${NAV_LABELS.fullExpense} · تقسیم`,
        href: `${wPath(slug, "expenses")}#quick-expense`,
        group: t("shell.groupShortcut"),
        channel: "action",
        haystack: `${NAV_LABELS.fullExpense} تقسیم جزئیات رویداد`,
      });
    }
    for (const tab of bottomTabsV2(template, slug)) {
      push({
        id: `tab-${tab.key}`,
        label: tab.label,
        href: tab.href,
        group: t("shell.groupShortcut"),
        channel: "page",
      });
    }
    if (slug) {
      push({
        id: "shortcut-expenses",
        label: NAV_LABELS.expenses,
        href: wPath(slug, "expenses"),
        group: t("shell.groupShortcut"),
        channel: "page",
        haystack: mosaicItemSummary("expenses"),
      });
      push({
        id: "shortcut-space",
        label: NAV_LABELS.space,
        href: wPath(slug, "space"),
        group: t("shell.groupShortcut"),
        channel: "page",
      });
      push({
        id: "shortcut-more",
        label: NAV_LABELS.more,
        href: wPath(slug, "more"),
        group: t("shell.groupShortcut"),
        channel: "page",
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
          channel: "page",
          haystack: `پوشه خانه ${domain}`,
        });
      }
      push({
        id: "act-settlements",
        label: NAV_LABELS.settlements,
        href: wPath(slug, "settlements"),
        group: t("shell.groupAction"),
        channel: "action",
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
            channel: "action",
            haystack: mosaicItemSummary("statements"),
          });
        }
        push({
          id: "act-statements",
          label: NAV_LABELS.statements,
          href: statementsListHref(slug),
          group: t("shell.groupAction"),
          channel: "action",
          haystack: mosaicItemSummary("statements"),
        });
      }
      push({
        id: "act-members",
        label: NAV_LABELS.members,
        href: wPath(slug, "members"),
        group: t("shell.groupAction"),
        channel: "action",
        haystack: `${NAV_LABELS.members} ${NAV_LABELS.invite} عضو نقش`,
      });
      push({
        id: "act-settings",
        label: t("shell.settingsSpace"),
        href: wPath(slug, "settings"),
        group: t("shell.groupAction"),
        channel: "page",
        haystack: mosaicItemSummary("settings"),
      });
    }
    for (const section of spaceNav(
      template,
      slug,
      spaceNavFlagsFromCapabilities(chrome.capabilities),
      membershipRole || null,
    )) {
      for (const item of section.items) {
        if (!roleAllowsNavKey(membershipRole, item.key)) continue;
        push({
          id: `nav-${item.key}`,
          label: item.label,
          href: item.href,
          group: section.label,
          channel: "page",
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
        channel: "page",
      });
    }
    for (const ws of chrome.workspaces) {
      const kind = spaceKindForTemplate(ws.template);
      push({
        id: `ws-${ws.id}`,
        label: ws.name,
        href: wPath(ws.slug),
        group: NAV_LABELS.spacesList,
        channel: "space",
        haystack: `${ws.slug} ${DIRECTORY_KIND_LABEL[kind]} ${ws.template}`,
      });
    }
    if (slug) {
      for (const unit of subunits) {
        push({
          id: `subunit-${unit.id}`,
          label: unit.name,
          href: wPath(slug, "subunits"),
          group: spaceKind === "building" ? "واحدها" : "بخش‌ها",
          channel: "subunit",
          haystack: `${unit.code ?? ""} ${unit.kind} ${unit.name}`,
        });
      }
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
    membershipRole,
    subunits,
    spaceKind,
  ]);

  const filtered = useMemo(() => {
    const scope = parseDirectoryQuery(query);
    const scoped = items.filter((item) => {
      if (scope.kind === "spaces") return item.channel === "space";
      if (scope.kind === "pages") {
        return item.channel === "page" || item.channel === "action";
      }
      if (scope.kind === "spaceKind") {
        if (item.channel !== "space") return false;
        const ws = chrome.workspaces.find((w) => wPath(w.slug) === item.href);
        return ws
          ? spaceKindForTemplate(ws.template) === scope.spaceKind
          : false;
      }
      return true;
    });

    const q = scope.text.trim();
    const scored = q
      ? scoped
          .map((item) => {
            const labelScore = fuzzyScore(q, item.label);
            const hayScore = item.haystack ? fuzzyScore(q, item.haystack) : -1;
            const score = Math.max(labelScore, hayScore);
            return { item, score };
          })
          .filter((row) => row.score >= 0)
          .sort(
            (a, b) =>
              b.score - a.score ||
              a.item.label.localeCompare(b.item.label, "fa"),
          )
      : (() => {
          const recentLabel = t("shell.groupRecent");
          const pinFirst = scoped.filter((item) => item.group === "پین‌شده");
          const recentFirst = scoped.filter(
            (item) => item.group === recentLabel && !pinFirst.includes(item),
          );
          const rest = scoped.filter(
            (item) =>
              item.group !== recentLabel && item.group !== "پین‌شده",
          );
          return [...pinFirst, ...recentFirst, ...rest].map((item) => ({
            item,
            score: 0,
          }));
        })();

    const perGroup = new Map<string, number>();
    const capped: PaletteItem[] = [];
    for (const row of scored) {
      const count = perGroup.get(row.item.group) ?? 0;
      if (count >= PER_GROUP_CAP) continue;
      perGroup.set(row.item.group, count + 1);
      capped.push(row.item);
      if (capped.length >= RESULT_CAP) break;
    }
    return capped;
  }, [items, query, chrome.workspaces]);

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
          placeholder={`${t("shell.searchPlaceholder")} · گ: س: فضا:`}
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
