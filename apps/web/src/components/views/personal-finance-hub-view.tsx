"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { ProductGrid, StatusLine } from "@/components/ui-blocks";
import { PersonalChartsPanel } from "@/components/charts/personal-charts-panel";
import { PersonalDepthPanel } from "@/components/personal-depth-panel";
import { PersonalFinanceOverviewPanel } from "@/components/personal-finance-overview-panel";
import { PersonalResourcesPanel } from "@/components/personal-resources/personal-resources-panel";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { usePersonalFinanceHashScroll } from "@/lib/use-personal-finance-hash-scroll";
import { spaceKindForTemplate } from "@dang/contracts";
import { wPath } from "@/lib/workspace-paths";

/**
 * Dedicated `/me/finance` hub — same API-backed panels as personal-space.
 * Deep-links both ways; goals gated on capabilities.providers.savingsGoals.
 */
export function PersonalFinanceHubView() {
  const chrome = useAppChrome();
  usePersonalFinanceHashScroll();
  const goalsLive = chrome.capabilities?.providers?.savingsGoals === "goals_v1";
  const chartsLive = chrome.capabilities?.providers?.charts === "charts_v1";
  const personalSpace = chrome.workspaces.find(
    (w) => spaceKindForTemplate(w.template) === "personal",
  );

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={NAV_LABELS.personalFinance}
      userName={chrome.userName}
      persistenceLabel={chrome.persistenceLabel}
    >
      <StatusLine>
        اعداد فقط از API واقعی — اهداف:{" "}
        {goalsLive ? "فعال" : "غیرفعال"} · نمودار:{" "}
        {chartsLive ? "فعال" : "غیرفعال"}
        {personalSpace ? (
          <>
            {" · "}
            <Link className="textButton" href={wPath(personalSpace.slug, "space")}>
              فضای شخصی
            </Link>
          </>
        ) : null}
        {" · "}
        <Link className="textButton" href="#goals">
          اهداف
        </Link>
        {" · "}
        <Link className="textButton" href="#resources">
          حساب‌ها
        </Link>
        {" · "}
        <Link className="textButton" href="#charts">
          نمودار
        </Link>
      </StatusLine>

      {!chrome.ready ? (
        <ContentSkeleton rows={4} label="در حال آماده‌سازی مالی من…" />
      ) : (
        <ProductGrid>
          <div id="overview">
            <PersonalFinanceOverviewPanel />
          </div>
          <div id="goals">
            <PersonalDepthPanel goalsLive={goalsLive} />
          </div>
          <div id="charts">
            <PersonalChartsPanel />
          </div>
          <div id="resources">
            <PersonalResourcesPanel />
          </div>
        </ProductGrid>
      )}
    </AppShell>
  );
}
