"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { spaceKindForTemplate } from "@dang/contracts";
import { useAppChrome } from "@/lib/use-app-chrome";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { PageHeader, SectionCard, StatusLine } from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { SpacesBalanceOverview } from "@/components/shell/spaces-balance-overview";
import { KindAggregatePanel } from "@/components/shell/kind-aggregate-panel";
import { ContextualMosaicHub } from "@/components/shell/contextual-mosaic-hub";
import { t } from "@/lib/i18n";
import { api } from "@/lib/api";
import { netFromIrrMinor, type SpaceNetRow } from "@/lib/space-net-balance";
import { kindDomainMosaicItems } from "@/lib/kind-hub-ops";

const KIND_ORDER = ["personal", "group", "building", "org"] as const;

const KIND_LABEL = {
  personal: "شخصی",
  group: "گروهی",
  building: "ساختمان",
  org: "سازمان",
} as const;

const KIND_HINT = {
  personal: "دفتر و بودجهٔ شخصی",
  group: "دوستان، خانواده و سفر",
  building: "واحدها، شارژ و قبوض مشترک ساختمان",
  org: "تیم، بخش‌ها و شرکت‌های زیرمجموعه",
} as const;

type NetCell =
  | { status: "ready"; row: SpaceNetRow }
  | { status: "loading" }
  | { status: "error" };

/**
 * Spaces hub — kind filter, kind-level aggregate reports, per-space tiles (ops inside).
 */
export default function SpacesPage() {
  const chrome = useAppChrome();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const kindFromUrl = searchParams.get("kind");
  const kindFilter: (typeof KIND_ORDER)[number] | "all" =
    kindFromUrl === "personal" ||
    kindFromUrl === "group" ||
    kindFromUrl === "building" ||
    kindFromUrl === "org"
      ? kindFromUrl
      : "all";
  const [nets, setNets] = useState<Record<string, NetCell>>({});
  const [netsLoading, setNetsLoading] = useState(false);
  const chartsAvailable =
    chrome.capabilities?.providers?.charts === "charts_v1";

  function setKindFilter(next: (typeof KIND_ORDER)[number] | "all") {
    if (next === "all") {
      router.replace("/spaces");
      return;
    }
    router.replace(`/spaces?kind=${next}`);
  }

  const grouped = useMemo(() => {
    const buckets: Record<(typeof KIND_ORDER)[number], typeof chrome.workspaces> = {
      personal: [],
      group: [],
      building: [],
      org: [],
    };
    const q = query.trim().toLowerCase();
    for (const ws of chrome.workspaces) {
      const kind = spaceKindForTemplate(ws.template);
      if (kindFilter !== "all" && kind !== kindFilter) continue;
      if (q) {
        const hay = `${ws.name} ${ws.slug} ${workspaceTemplateLabel(ws.template)}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      buckets[kind].push(ws);
    }
    return buckets;
  }, [chrome.workspaces, query, kindFilter]);

  const totals = useMemo(() => {
    const counts = { personal: 0, group: 0, building: 0, org: 0, all: chrome.workspaces.length };
    for (const ws of chrome.workspaces) {
      counts[spaceKindForTemplate(ws.template)] += 1;
    }
    return counts;
  }, [chrome.workspaces]);

  const kindDomainSections = useMemo(
    () => [
      {
        key: "life-domains",
        label: "حوزه‌ها",
        description: "برای گزارش تجمیعی و فهرست فضاها، یک حوزه را باز کنید",
        items: kindDomainMosaicItems({
          personal: totals.personal,
          group: totals.group,
          building: totals.building,
          org: totals.org,
        }),
      },
    ],
    [totals],
  );

  const visibleCount =
    grouped.personal.length +
    grouped.group.length +
    grouped.building.length +
    grouped.org.length;

  const readyRows = useMemo(() => {
    const rows: SpaceNetRow[] = [];
    for (const cell of Object.values(nets)) {
      if (cell.status === "ready") rows.push(cell.row);
    }
    return rows;
  }, [nets]);

  const kindRows = useMemo(() => {
    if (kindFilter === "all") return readyRows;
    return readyRows.filter((row) => row.spaceKind === kindFilter);
  }, [readyRows, kindFilter]);

  const kindSpaces = useMemo(() => {
    if (kindFilter === "all") return [];
    return chrome.workspaces
      .filter((ws) => spaceKindForTemplate(ws.template) === kindFilter)
      .map((ws) => ({ id: ws.id, slug: ws.slug, name: ws.name }));
  }, [chrome.workspaces, kindFilter]);

  useEffect(() => {
    if (!chrome.ready || chrome.workspaces.length === 0) return;
    let cancelled = false;
    setNetsLoading(true);
    setNets((prev) => {
      const next = { ...prev };
      for (const ws of chrome.workspaces) {
        if (!next[ws.id] || next[ws.id]?.status === "error") {
          next[ws.id] = { status: "loading" };
        }
      }
      return next;
    });
    void (async () => {
      try {
        const dash = await api.personalDashboard();
        if (cancelled) return;
        const byId = new Map(
          dash.finance.workspaces.map((line) => [line.workspaceId, line] as const),
        );
        setNets(() => {
          const next: Record<string, NetCell> = {};
          for (const ws of chrome.workspaces) {
            const line = byId.get(ws.id);
            if (!line) {
              next[ws.id] = { status: "error" };
              continue;
            }
            next[ws.id] = {
              status: "ready",
              row: {
                workspaceId: ws.id,
                slug: ws.slug,
                name: ws.name,
                spaceKind: spaceKindForTemplate(ws.template),
                net: netFromIrrMinor(line.net.amountMinor),
                openSettlements: line.openSettlements,
              },
            };
          }
          return next;
        });
      } catch {
        if (cancelled) return;
        setNets(() => {
          const next: Record<string, NetCell> = {};
          for (const ws of chrome.workspaces) {
            next[ws.id] = { status: "error" };
          }
          return next;
        });
      } finally {
        if (!cancelled) setNetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chrome.ready, chrome.workspaces]);

  return (
    <div className="spaces-hubPage">
      <PageHeader
        eyebrow="فضاها"
        title={NAV_LABELS.spacesList}
        description="گزارش تجمیعی هر حوزه بالا؛ ثبت خرج و تسویه داخل همان فضا."
        actions={
          <>
            <Link className="textButton" href="/join">
              پیوستن با شناسه
            </Link>
            <Link className="shell-v2__cta" href="/spaces/new">
              {NAV_LABELS.createSpace}
            </Link>
          </>
        }
      />

      {!chrome.ready ? (
        <ContentSkeleton rows={3} label="در حال بارگذاری…" />
      ) : chrome.workspaces.length === 0 ? (
        <div className="spaces-hub">
          <ContextualMosaicHub
            sections={kindDomainSections}
            title="انتخاب حوزه"
            description="هنوز فضایی ندارید — حوزه را برای ساخت باز کنید."
            compact={false}
            headingId="spaces-empty-kinds"
          />
          <SectionCard title="هنوز فضایی ندارید">
            <p>برای شروع یک فضای شخصی، گروهی یا سازمانی بسازید.</p>
            <Link className="shell-v2__cta" href="/spaces/new">
              {NAV_LABELS.createSpace}
            </Link>
          </SectionCard>
        </div>
      ) : (
        <div className="spaces-hub">
          <SpacesBalanceOverview
            rows={readyRows}
            loading={netsLoading}
            onlyKind={kindFilter === "all" ? null : kindFilter}
          />

          {kindFilter === "all" ? (
            <ContextualMosaicHub
              sections={kindDomainSections}
              title="حوزه‌ها"
              description="برای صورتحساب و نمودار تجمیعی، یک حوزه را باز کنید — عملیات روزمره داخل هر فضاست."
              compact={false}
              headingId="spaces-all-kinds"
            />
          ) : (
            <KindAggregatePanel
              kind={kindFilter}
              spaces={kindSpaces}
              rows={kindRows}
              chartsAvailable={chartsAvailable}
            />
          )}

          <div className="spaces-hub__toolbar">
            <label className="spaces-hub__search">
              <span className="visually-hidden">جستجوی فضا</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="جستجوی نام یا قالب فضا…"
                autoComplete="off"
              />
            </label>
            <div className="spaces-hub__filters" role="tablist" aria-label="نوع فضا">
              {(
                [
                  { key: "all" as const, label: "همه", count: totals.all },
                  { key: "personal" as const, label: KIND_LABEL.personal, count: totals.personal },
                  { key: "group" as const, label: KIND_LABEL.group, count: totals.group },
                  { key: "building" as const, label: KIND_LABEL.building, count: totals.building },
                  { key: "org" as const, label: KIND_LABEL.org, count: totals.org },
                ]
              ).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  role="tab"
                  id={`spaces-filter-${chip.key}`}
                  aria-selected={kindFilter === chip.key}
                  aria-controls="spaces-hub-results"
                  className={`spaces-hub__chip${kindFilter === chip.key ? " is-active" : ""}`}
                  onClick={() => setKindFilter(chip.key)}
                >
                  {chip.label}
                  <span>{chip.count}</span>
                </button>
              ))}
            </div>
          </div>

          <StatusLine>
            {visibleCount === 0
              ? t("shell.spacesHubEmptyFilter")
              : `${t("shell.spacesHubHint", { count: visibleCount })} · از کاشی وارد فضا شوید`}
          </StatusLine>

          <div id="spaces-hub-results" role="tabpanel" aria-live="polite">
          {visibleCount === 0 ? (
            <SectionCard title={kindFilter === "all" ? "نتیجه‌ای نیست" : `هنوز فضای «${KIND_LABEL[kindFilter]}» ندارید`}>
              <p>
                {kindFilter === "all"
                  ? "فیلتر یا عبارت جستجو را عوض کنید."
                  : KIND_HINT[kindFilter]}
              </p>
              <div className="dataRowActions">
                {kindFilter !== "all" ? (
                  <Link
                    className="shell-v2__cta"
                    href={`/spaces/new?kind=${kindFilter}`}
                  >
                    ساخت فضای {KIND_LABEL[kindFilter]}
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="textButton"
                  onClick={() => {
                    setQuery("");
                    setKindFilter("all");
                  }}
                >
                  پاک‌کردن فیلتر
                </button>
              </div>
            </SectionCard>
          ) : (
            KIND_ORDER.map((kind) => {
              const list = grouped[kind];
              if (list.length === 0) return null;
              return (
                <section
                  key={kind}
                  className="spaces-hub__group"
                  aria-labelledby={`spaces-kind-${kind}`}
                >
                  <header className="spaces-hub__groupHead">
                    <h2 id={`spaces-kind-${kind}`} className="spaces-hub__heading">
                      {KIND_LABEL[kind]}
                      <span className="spaces-hub__count">{list.length}</span>
                    </h2>
                    <p className="spaces-hub__kindHint">
                      {KIND_HINT[kind]} — عملیات مالی داخل هر فضا
                    </p>
                  </header>
                  <ul className="spaces-mosaic">
                    {list.map((ws) => {
                      const active = ws.id === chrome.workspaceId;
                      const cell = nets[ws.id];
                      const tone =
                        cell?.status === "ready" ? cell.row.net.tone : "pending";
                      const label =
                        cell?.status === "loading" || !cell
                          ? "…"
                          : cell.status === "error"
                            ? "—"
                            : cell.row.net.label;
                      const open =
                        cell?.status === "ready" && cell.row.openSettlements > 0
                          ? cell.row.openSettlements
                          : 0;
                      const showLedger = kind !== "personal";
                      return (
                        <li key={ws.id} className={`spaces-mosaic__tile${active ? " is-active" : ""}`}>
                          <Link
                            href={wPath(ws.slug, "space")}
                            className="spaces-mosaic__main"
                            onClick={() => chrome.selectWorkspace(ws.id)}
                            aria-current={active ? "page" : undefined}
                          >
                            <span className="spaces-mosaic__titleRow">
                              <b>{ws.name}</b>
                              <span className={`spaces-list__kind is-${kind}`}>
                                {KIND_LABEL[kind]}
                              </span>
                              {active ? (
                                <span className="spaces-list__activePill">فعال</span>
                              ) : null}
                            </span>
                            <small>
                              {workspaceTemplateLabel(ws.template)}
                              {kind === "group" || kind === "building" ? (
                                <>
                                  {" · شناسه "}
                                  <code dir="ltr">{ws.slug}</code>
                                </>
                              ) : null}
                              {open > 0
                                ? ` · ${open.toLocaleString("fa-IR")} تسویه باز`
                                : ""}
                            </small>
                            <span className={`spaces-mosaic__net is-${tone}`}>{label}</span>
                          </Link>
                          <div className="spaces-mosaic__ops" aria-label={`ورود به امکانات داخل ${ws.name}`}>
                            <Link
                              href={wPath(ws.slug, "expenses")}
                              onClick={() => chrome.selectWorkspace(ws.id)}
                            >
                              ثبت خرج
                            </Link>
                            <Link
                              href={wPath(ws.slug, "settlements")}
                              onClick={() => chrome.selectWorkspace(ws.id)}
                            >
                              تسویه
                            </Link>
                            {showLedger ? (
                              <Link
                                href={wPath(ws.slug, "ledger")}
                                onClick={() => chrome.selectWorkspace(ws.id)}
                              >
                                دفتر روزانه
                              </Link>
                            ) : (
                              <Link href="/me/finance">مالی شخصی</Link>
                            )}
                            <Link
                              href={wPath(ws.slug, "invoices")}
                              onClick={() => chrome.selectWorkspace(ws.id)}
                            >
                              صورتحساب
                            </Link>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
          </div>

          <div className="spaces-hub__footerCta">
            <Link
              className="shell-v2__cta"
              href={
                kindFilter === "all"
                  ? "/spaces/new"
                  : `/spaces/new?kind=${kindFilter}`
              }
            >
              {kindFilter === "all"
                ? NAV_LABELS.createSpace
                : `ساخت فضای ${KIND_LABEL[kindFilter]}`}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
