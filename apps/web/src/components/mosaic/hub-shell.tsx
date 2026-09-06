"use client";

import { MosaicBackBar } from "@/components/mosaic/mosaic-back-bar";
import { MosaicContentFrame } from "@/components/mosaic/mosaic-content-frame";
import { MosaicGrid } from "@/components/mosaic/mosaic-grid";
import { MosaicHeroArt } from "@/components/mosaic/mosaic-hero-art";
import { MosaicQuickActions } from "@/components/mosaic/mosaic-quick-actions";
import { MosaicHubFind } from "@/components/mosaic/mosaic-hub-find";
import { MosaicPersonalFinanceStrip } from "@/components/mosaic/mosaic-personal-finance-strip";
import { HubEmbedProvider } from "@/components/mosaic/hub-embed";
import { useMosaicNav } from "@/components/mosaic/mosaic-nav-context";
import { getHubPage } from "@/lib/hub-page-registry";
import { hubPathFor } from "@/lib/hub-links";
import { useAppChrome } from "@/lib/use-app-chrome";
import type { NavNode } from "@/lib/navigation-types";
import { spaceKindForTemplate } from "@dang/contracts";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useId, useState } from "react";

const MosaicRecentActivity = dynamic(
  () =>
    import("@/components/mosaic/mosaic-recent-activity").then((m) => ({
      default: m.MosaicRecentActivity,
    })),
  { ssr: false, loading: () => null },
);

export function HubShell() {
  const {
    currentNodes,
    isContentMode,
    contentRoute,
    navKey,
    pushGroup,
    openContent,
    pop,
    closeContent,
    stack,
    breadcrumbTrail,
    direction,
  } = useMosaicNav();
  const chrome = useAppChrome();
  const ws = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const kind = spaceKindForTemplate(ws?.template);
  const journeyHint =
    kind === "personal"
      ? { text: "سفر شخصی: ثبت خرج خصوصی از دکمهٔ اصلی یا تب «من».", href: hubPathFor("/me") }
      : kind === "org"
        ? {
            text: "سفر سازمان: بودجه و تأیید مطالبات در خانهٔ سازمان؛ خرید در «بیشتر» / تدارکات.",
            href: hubPathFor("/orgs"),
          }
        : {
            text: "مادرخرج: از «ثبت خرج گروه» سهم اعضا را بنویسید؛ تسویه همان مسیر مالی است.",
            href: `${hubPathFor("/group")}#quick-expense`,
          };
  const [greeting, setGreeting] = useState("سلام");
  const [today, setToday] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsPanelId = useId();

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "صبح بخیر" : hour < 18 ? "روز بخیر" : "عصر بخیر");
    setToday(
      new Intl.DateTimeFormat("fa-IR", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }).format(new Date()),
    );
  }, []);

  const handleTileClick = useCallback(
    (node: NavNode) => {
      if (node.isGroup && node.children?.length) {
        pushGroup(node);
        return;
      }
      if (node.route) openContent(node);
    },
    [pushGroup, openContent],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isContentMode) closeContent();
        else if (stack.length > 0) pop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isContentMode, stack.length, pop, closeContent]);

  const stageClass =
    direction === "back" ? "mosaic-stage is-back" : "mosaic-stage is-forward";
  const isRoot = stack.length === 0;
  const sectionTitle = isRoot
    ? "همه ابزارها"
    : (breadcrumbTrail[breadcrumbTrail.length - 1]?.label ?? "پوشه");

  if (isContentMode && contentRoute) {
    const Page = getHubPage(contentRoute);
    const title = breadcrumbTrail[breadcrumbTrail.length - 1]?.label;

    return (
      <div className={`mosaic-workspace ${stageClass}`} key={`content-${navKey}`}>
        <div className="mosaic-path-slot mosaic-path-slot--with-folder">
          <MosaicBackBar />
          {currentNodes.length > 0 ? (
            <details className="mosaic-folder-menu">
              <summary>در این پوشه ({currentNodes.length})</summary>
              <div className="mosaic-folder-menu__body">
                <MosaicGrid
                  nodes={currentNodes}
                  animationKey={`rail-${navKey}`}
                  density="list"
                  onTileClick={handleTileClick}
                />
              </div>
            </details>
          ) : null}
        </div>
        <section className="mosaic-workspace__main">
          <MosaicContentFrame title={title}>
            <HubEmbedProvider>
              {Page ? <Page /> : <p className="emptyHint">صفحه یافت نشد.</p>}
            </HubEmbedProvider>
          </MosaicContentFrame>
        </section>
      </div>
    );
  }

  return (
    <div className={`mosaic-browse ${stageClass}`} key={`grid-${navKey}`}>
      {!isRoot ? (
        <div className="mosaic-path-slot">
          <MosaicBackBar />
        </div>
      ) : null}

      {isRoot ? (
        <header className="mosaic-home mosaic-home--lean">
          <div className="mosaic-home__intro">
            <div className="mosaic-home__meta">
              <span>فضای کاری</span>
              <time suppressHydrationWarning>{today || "—"}</time>
            </div>
            <h1 className="mosaic-home__title">{greeting}</h1>
            <p className="mosaic-home__lead">یک کار بعدی، بقیه ابزارها پایین‌تر.</p>
          </div>

          <div className="mosaic-home__primary">
            <MosaicQuickActions />
          </div>

          {chrome.ready && chrome.workspaceId ? (
            <p className="mosaic-journey-hint">
              <span>{journeyHint.text}</span>{" "}
              <Link href={journeyHint.href}>ادامه</Link>
            </p>
          ) : null}

          <div className="mosaic-home__activity">
            <MosaicRecentActivity limit={3} />
          </div>
        </header>
      ) : null}

      {isRoot ? (
        <details
          className="mosaic-all-tools"
          open={toolsOpen}
          onToggle={(e) => setToolsOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="mosaic-all-tools__summary">
            <span>
              <b>همه ابزارها</b>
              <small>یافتن، مالیه من، ماژول‌ها — بدون حذف</small>
            </span>
            <span className="mosaic-all-tools__count">{currentNodes.length}</span>
          </summary>
          <div className="mosaic-all-tools__body" id={toolsPanelId}>
            <MosaicHeroArt />
            <MosaicHubFind />
            <MosaicPersonalFinanceStrip />
            <div className="mosaic-section-label">
              <b>{sectionTitle}</b>
              <span>{currentNodes.length}</span>
            </div>
            <MosaicGrid
              nodes={currentNodes}
              animationKey={navKey}
              density="tile"
              onTileClick={handleTileClick}
            />
          </div>
        </details>
      ) : (
        <>
          <div className="mosaic-section-label">
            <b>{sectionTitle}</b>
            <span>{currentNodes.length}</span>
          </div>
          <MosaicGrid
            nodes={currentNodes}
            animationKey={navKey}
            density="list"
            onTileClick={handleTileClick}
          />
        </>
      )}
    </div>
  );
}
