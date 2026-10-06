"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { PersonalLifestyleCommand } from "@/components/shell/personal-lifestyle-command";
import { ProductGrid, StatusLine } from "@/components/ui-blocks";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { PersonalChartsPanel } from "@/components/charts/personal-charts-panel";
import { PersonalDepthPanel } from "@/components/personal-depth-panel";
import { PersonalFinanceOverviewPanel } from "@/components/personal-finance-overview-panel";
import { PersonalResourcesPanel } from "@/components/personal-resources/personal-resources-panel";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { usePersonalFinanceHashScroll } from "@/lib/use-personal-finance-hash-scroll";
import { spaceKindForTemplate } from "@dang/contracts";
import { wPath } from "@/lib/workspace-paths";
import styles from "./personal-finance-hub-view.module.css";

/**
 * `/me/finance` hub — lifestyle composition first; secondary panels below the fold.
 */
export function PersonalFinanceHubView() {
  const chrome = useAppChrome();
  usePersonalFinanceHashScroll();
  const goalsLive = chrome.capabilities?.providers?.savingsGoals === "goals_v1";
  const chartsLive = chrome.capabilities?.providers?.charts === "charts_v1";
  const intentsLive = chrome.capabilities?.providers?.moneyIntents === "intents_v1";
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
      <WorkspacePageFrame
        title=""
        description=""
        state={!chrome.ready ? "loading" : "ready"}
        loadingLabel="در حال آماده‌سازی مالی من…"
        secondaryActions={
          personalSpace ? (
            <Link href={wPath(personalSpace.slug, "space")}>دفتر من</Link>
          ) : undefined
        }
      >
        {!chrome.ready ? (
          <ContentSkeleton rows={4} label="در حال آماده‌سازی مالی من…" />
        ) : (
          <>
            <PersonalLifestyleCommand />

            <nav className={styles.subnav} aria-label="بخش‌های مالی من">
              <Link className={styles.subnavLink} href="#overview">
                گروه‌ها و فضاها
              </Link>
              {goalsLive ? (
                <Link className={styles.subnavLink} href="#goals">
                  اهداف
                </Link>
              ) : null}
              {intentsLive ? (
                <Link className={styles.subnavLink} href="#intents">
                  قواعد
                </Link>
              ) : null}
              <Link className={styles.subnavLink} href="#resources">
                حساب‌ها
              </Link>
              {chartsLive ? (
                <Link className={styles.subnavLink} href="#charts">
                  نمودار
                </Link>
              ) : null}
            </nav>

            <StatusLine>
              اهداف: {goalsLive ? "فعال" : "غیرفعال"} · قواعد:{" "}
              {intentsLive ? "فعال" : "غیرفعال"} · نمودار:{" "}
              {chartsLive ? "فعال" : "غیرفعال"}
            </StatusLine>

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
          </>
        )}
      </WorkspacePageFrame>
    </AppShell>
  );
}
