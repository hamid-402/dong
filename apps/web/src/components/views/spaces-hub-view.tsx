"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { spaceKindForTemplate, spaceKindOffered } from "@dang/contracts";
import { useAppChrome } from "@/lib/use-app-chrome";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  PageHeader,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { SpacesBalanceOverview } from "@/components/shell/spaces-balance-overview";
import { KindAggregatePanel } from "@/components/shell/kind-aggregate-panel";
import { MotionSceneStrip } from "@/components/visual/motion-scene";
import { KindMoodBadge } from "@/components/visual/kind-mood-badge";
import { ContextualMosaicHub } from "@/components/shell/contextual-mosaic-hub";
import { t } from "@/lib/i18n";
import { api } from "@/lib/api";
import {
  filterLivePinnedWorkspaces,
  filterLiveRecentWorkspaces,
  listPinnedWorkspaces,
  listRecentWorkspaces,
  isWorkspacePinned,
} from "@/lib/workspace-directory-prefs";
import {
  syncPinnedWorkspacesFromServer,
  togglePinnedWorkspaceSynced,
} from "@/lib/workspace-pin-sync";
import { DIRECTORY_KIND_VISIBLE_CAP } from "@/lib/workspace-directory-model";
import { fuzzyScore } from "@/lib/fuzzy-score";
import { netFromIrrMinor, type SpaceNetRow } from "@/lib/space-net-balance";
import { useDisplayUnit } from "@/lib/display-unit";
import { kindDomainMosaicItems } from "@/lib/kind-hub-ops";
import { assignKindGems, gemCssVars } from "@/lib/tile-gem-palettes";

const KIND_ORDER = ["personal", "group", "building", "org"] as const;

const KIND_GEM = {
  personal: "indigo",
  group: "teal",
  building: "amber",
  org: "violet",
} as const;

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
 * Unified app home — balances, kind hubs, searchable space list.
 * Filter lives at `/home?kind=…` (legacy `/spaces` redirects here).
 */
export function SpacesHubView() {
  const chrome = useAppChrome();
  const displayUnit = useDisplayUnit();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [readyHint, setReadyHint] = useState<string | null>(null);
  const [pinTick, setPinTick] = useState(0);
  const [expandedKinds, setExpandedKinds] = useState<
    Partial<Record<(typeof KIND_ORDER)[number], boolean>>
  >({});
  const kindFromUrl = searchParams.get("kind");
  const productFlags = chrome.capabilities?.productFlags;
  const kindOffered = (kind: (typeof KIND_ORDER)[number]) =>
    spaceKindOffered(kind, {
      buildingSpaces: productFlags?.buildingSpaces === true,
      orgSpaces: productFlags?.orgSpaces === true,
    });
  const kindFilter: (typeof KIND_ORDER)[number] | "all" =
    (kindFromUrl === "personal" ||
      kindFromUrl === "group" ||
      kindFromUrl === "building" ||
      kindFromUrl === "org") &&
    kindOffered(kindFromUrl)
      ? kindFromUrl
      : "all";
  const [nets, setNets] = useState<Record<string, NetCell>>({});
  const [netsLoading, setNetsLoading] = useState(false);
  const chartsAvailable =
    chrome.capabilities?.providers?.charts === "charts_v1";

  function setKindFilter(next: (typeof KIND_ORDER)[number] | "all") {
    if (next === "all") {
      router.replace("/home");
      return;
    }
    router.replace(`/home?kind=${next}`);
  }

  const liveIds = useMemo(
    () => chrome.workspaces.map((w) => w.id),
    [chrome.workspaces],
  );

  useEffect(() => {
    if (!chrome.ready || liveIds.length === 0) return;
    let cancelled = false;
    void syncPinnedWorkspacesFromServer(liveIds).then(() => {
      if (!cancelled) setPinTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [chrome.ready, liveIds]);

  const pinnedSpaces = useMemo(() => {
    void pinTick;
    return filterLivePinnedWorkspaces(listPinnedWorkspaces(), liveIds)
      .map((pin) => chrome.workspaces.find((w) => w.id === pin.workspaceId))
      .filter((w): w is (typeof chrome.workspaces)[number] => Boolean(w));
  }, [chrome.workspaces, liveIds, pinTick]);

  const recentSpaces = useMemo(() => {
    void pinTick;
    const pinIds = new Set(pinnedSpaces.map((w) => w.id));
    return filterLiveRecentWorkspaces(listRecentWorkspaces(), liveIds)
      .map((row) => chrome.workspaces.find((w) => w.id === row.workspaceId))
      .filter(
        (w): w is (typeof chrome.workspaces)[number] =>
          Boolean(w) && !pinIds.has(w!.id),
      );
  }, [chrome.workspaces, liveIds, pinTick, pinnedSpaces]);

  const grouped = useMemo(() => {
    const buckets: Record<(typeof KIND_ORDER)[number], typeof chrome.workspaces> = {
      personal: [],
      group: [],
      building: [],
      org: [],
    };
    const q = query.trim();
    for (const ws of chrome.workspaces) {
      const kind = spaceKindForTemplate(ws.template);
      if (kindFilter !== "all" && kind !== kindFilter) continue;
      if (q) {
        const hay = `${ws.name} ${ws.slug} ${workspaceTemplateLabel(ws.template)}`;
        if (fuzzyScore(q, hay) < 0) continue;
      }
      buckets[kind].push(ws);
    }
    return buckets;
  }, [chrome.workspaces, query, kindFilter]);

  const spaceGemById = useMemo(() => {
    const idsByKind: Record<(typeof KIND_ORDER)[number], string[]> = {
      personal: [],
      group: [],
      building: [],
      org: [],
    };
    for (const ws of chrome.workspaces) {
      idsByKind[spaceKindForTemplate(ws.template)].push(ws.id);
    }
    const map = new Map<string, string>();
    for (const kind of KIND_ORDER) {
      for (const [id, gem] of assignKindGems(kind, idsByKind[kind])) {
        map.set(id, gem);
      }
    }
    return map;
  }, [chrome.workspaces]);

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
        items: kindDomainMosaicItems(
          {
            personal: totals.personal,
            group: totals.group,
            building: totals.building,
            org: totals.org,
          },
          (kind) =>
            spaceKindOffered(kind, {
              buildingSpaces: productFlags?.buildingSpaces === true,
              orgSpaces: productFlags?.orgSpaces === true,
            }),
        ),
      },
    ],
    [totals, productFlags],
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
    if (!chrome.ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const health = await api.healthReady();
        if (cancelled) return;
        if (health.status === "ready") {
          const db = health.checks?.database === "ok" ? "دیتابیس آماده" : "بدون تأیید DB";
          setReadyHint(`${db} · ${chrome.persistenceLabel}`);
        } else {
          setReadyHint("سرویس هنوز آماده نیست — عدد جعلی نشان داده نمی‌شود");
        }
      } catch {
        if (!cancelled) setReadyHint(chrome.persistenceLabel);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chrome.ready, chrome.persistenceLabel]);

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
                net: netFromIrrMinor(line.net.amountMinor, displayUnit),
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
  }, [chrome.ready, chrome.workspaces, displayUnit]);

  return (
    <div className="spaces-hubPage appHomeMosaic">
      <div className="spaces-hubPage__chrome">
        <PageHeader
          eyebrow="دنگ"
          title={NAV_LABELS.home}
          description="جمع‌مانده زنده و فهرست فضاها — ثبت پول و تسویه داخل هر فضا."
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
      </div>

      {!chrome.ready ? (
        <ContentSkeleton rows={3} label="در حال بارگذاری خانه…" />
      ) : chrome.workspaces.length === 0 ? (
        <div className="spaces-hub">
          {readyHint ? (
            <StatusLine>
              <StatusPill tone="ok">زیرساخت</StatusPill> {readyHint}
            </StatusLine>
          ) : null}
          <div className="spaces-hub__primary">
            <ContextualMosaicHub
              sections={kindDomainSections}
              title="انتخاب حوزه"
              description="هنوز فضایی ندارید — حوزه را برای ساخت باز کنید."
              compact={false}
              headingId="home-empty-kinds"
            />
          </div>
          <SectionCard title="هنوز فضایی ندارید">
            <p>
              {kindOffered("org")
                ? "برای شروع یک فضای شخصی، گروهی یا سازمانی بسازید."
                : "برای شروع یک فضای شخصی یا گروهی بسازید."}
            </p>
            <div className="dataRowActions">
              <Link className="shell-v2__cta" href="/spaces/new">
                {NAV_LABELS.createSpace}
              </Link>
              <Link href="/spaces/new?kind=group" className="textButton">
                گروه
              </Link>
              {kindOffered("building") ? (
                <Link href="/spaces/new?kind=building" className="textButton">
                  ساختمان
                </Link>
              ) : null}
              {kindOffered("org") ? (
                <Link href="/spaces/new?kind=org" className="textButton">
                  سازمان
                </Link>
              ) : null}
              <Link href="/spaces/new?kind=personal" className="textButton">
                شخصی
              </Link>
            </div>
          </SectionCard>
          <MotionSceneStrip kind="home" prominence="compact" />
        </div>
      ) : (
        <div className="spaces-hub">
          {readyHint ? (
            <StatusLine>
              <StatusPill tone="ok">زیرساخت</StatusPill> {readyHint}
            </StatusLine>
          ) : null}

          <div className="spaces-hub__primary">
            <SpacesBalanceOverview
              rows={readyRows}
              loading={netsLoading}
              onlyKind={kindFilter === "all" ? null : kindFilter}
            />
          </div>

          <div className="spaces-hub__secondary">
            {kindFilter === "all" ? (
              <ContextualMosaicHub
                sections={kindDomainSections}
                title="حوزه‌ها"
                description="برای صورتحساب و نمودار تجمیعی، یک حوزه را باز کنید — عملیات روزمره داخل هر فضاست."
                compact={false}
                weight="secondary"
                headingId="home-all-kinds"
              />
            ) : (
              <KindAggregatePanel
                kind={kindFilter}
                spaces={kindSpaces}
                rows={kindRows}
                chartsAvailable={chartsAvailable}
              />
            )}
            <MotionSceneStrip
              kind={
                kindFilter === "personal"
                  ? "personal"
                  : kindFilter === "group"
                    ? "partners"
                    : kindFilter === "building"
                      ? "building"
                      : kindFilter === "org"
                        ? "security"
                        : "home"
              }
              prominence="compact"
            />
          </div>

          <div className="spaces-hub__list">
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
                ].filter((chip) => chip.key === "all" || kindOffered(chip.key))
              ).map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  role="tab"
                  id={`home-filter-${chip.key}`}
                  aria-selected={kindFilter === chip.key}
                  aria-controls="home-hub-results"
                  className={`spaces-hub__chip${kindFilter === chip.key ? " is-active" : ""}`}
                  data-kind={chip.key === "all" ? undefined : chip.key}
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

          {pinnedSpaces.length > 0 || recentSpaces.length > 0 ? (
            <div className="spaces-hub__quickStrip" aria-label="پین و اخیر">
              {pinnedSpaces.length > 0 ? (
                <div className="spaces-hub__quickBlock">
                  <span className="spaces-hub__quickLabel">پین‌شده</span>
                  <ul className="spaces-hub__quickList">
                    {pinnedSpaces.map((ws) => (
                      <li key={`pin-${ws.id}`}>
                        <Link
                          href={wPath(ws.slug, "space")}
                          onClick={() => chrome.selectWorkspace(ws.id)}
                        >
                          {ws.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {recentSpaces.length > 0 ? (
                <div className="spaces-hub__quickBlock">
                  <span className="spaces-hub__quickLabel">اخیر</span>
                  <ul className="spaces-hub__quickList">
                    {recentSpaces.map((ws) => (
                      <li key={`recent-${ws.id}`}>
                        <Link
                          href={wPath(ws.slug, "space")}
                          onClick={() => chrome.selectWorkspace(ws.id)}
                        >
                          {ws.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div id="home-hub-results" role="tabpanel" aria-live="polite">
            {visibleCount === 0 ? (
              <SectionCard
                title={
                  kindFilter === "all"
                    ? "نتیجه‌ای نیست"
                    : `هنوز فضای «${KIND_LABEL[kindFilter]}» ندارید`
                }
              >
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
                const dense =
                  kindFilter !== "all" || list.length > DIRECTORY_KIND_VISIBLE_CAP;
                const expanded = Boolean(expandedKinds[kind]) || Boolean(query.trim());
                const visible = expanded
                  ? list
                  : list.slice(0, DIRECTORY_KIND_VISIBLE_CAP);
                const hidden = Math.max(0, list.length - visible.length);
                return (
                  <section
                    key={kind}
                    className={`spaces-hub__group${dense ? " spaces-hub__group--dense" : ""}`}
                    data-kind={kind}
                    aria-labelledby={`home-kind-${kind}`}
                  >
                    <header className="spaces-hub__groupHead">
                      <h2 id={`home-kind-${kind}`} className="spaces-hub__heading">
                        <KindMoodBadge kind={kind} size={18} />
                        {KIND_LABEL[kind]}
                        <span className="spaces-hub__count">{list.length}</span>
                      </h2>
                      <p className="spaces-hub__kindHint">
                        {KIND_HINT[kind]} — عملیات مالی داخل هر فضا
                      </p>
                    </header>
                    <ul className={`spaces-mosaic${dense ? " spaces-mosaic--dense" : ""}`}>
                      {visible.map((ws) => {
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
                        const pinned = isWorkspacePinned(ws.id);
                        return (
                          <li
                            key={ws.id}
                            className={`dang-gem dang-gem--panel spaces-mosaic__tile${active ? " is-active" : ""}`}
                            style={gemCssVars(spaceGemById.get(ws.id) ?? KIND_GEM[kind])}
                          >
                            <Link
                              href={wPath(ws.slug, "space")}
                              className="spaces-mosaic__main"
                              onClick={() => chrome.selectWorkspace(ws.id)}
                              aria-current={active ? "page" : undefined}
                            >
                              <span className="spaces-mosaic__titleRow">
                                <KindMoodBadge kind={kind} size={24} />
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
                            <button
                              type="button"
                              className={`spaces-mosaic__pin${pinned ? " is-on" : ""}`}
                              aria-pressed={pinned}
                              aria-label={
                                pinned
                                  ? `برداشتن پین ${ws.name}`
                                  : `پین کردن ${ws.name}`
                              }
                              onClick={() => {
                                void togglePinnedWorkspaceSynced(
                                  ws.id,
                                  liveIds,
                                ).then(() => setPinTick((n) => n + 1));
                              }}
                            >
                              {pinned ? "★" : "☆"}
                            </button>
                            <div
                              className="spaces-mosaic__ops"
                              aria-label={`ورود به امکانات داخل ${ws.name}`}
                            >
                              <Link
                                href={wPath(ws.slug, "record")}
                                onClick={() => chrome.selectWorkspace(ws.id)}
                              >
                                {NAV_LABELS.addExpense}
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
                                  {NAV_LABELS.dailyEntry}
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
                    {hidden > 0 ? (
                      <button
                        type="button"
                        className="spaces-hub__more"
                        onClick={() =>
                          setExpandedKinds((prev) => ({ ...prev, [kind]: true }))
                        }
                      >
                        نمایش {hidden.toLocaleString("fa-IR")} فضای دیگر
                      </button>
                    ) : null}
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
            <StatusLine>
              <Link href="/spaces/reports?kind=group">گزارش گروهی</Link>
              {kindOffered("building") ? (
                <>
                  {" · "}
                  <Link href="/spaces/reports?kind=building">گزارش ساختمان</Link>
                </>
              ) : null}
              {" · "}
              <Link href="/me/finance">{NAV_LABELS.personalFinance}</Link>
            </StatusLine>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
