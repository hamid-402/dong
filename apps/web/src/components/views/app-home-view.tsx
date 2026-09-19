"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { spaceKindForTemplate, type SpaceKind } from "@dang/contracts";
import { AppShell } from "@/components/app-shell";
import { SpacesBalanceOverview } from "@/components/shell/spaces-balance-overview";
import { ContextualMosaicHub } from "@/components/shell/contextual-mosaic-hub";
import {
  EmptyStateBlock,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { api } from "@/lib/api";
import { netFromIrrMinor, type SpaceNetRow } from "@/lib/space-net-balance";
import { kindDomainMosaicItems } from "@/lib/kind-hub-ops";

/**
 * App-level home — kind launcher + per-kind balances.
 * Day-to-day finance lives inside each space; kind hubs hold aggregate reports.
 */
export function AppHomeView() {
  const chrome = useAppChrome();
  const [nets, setNets] = useState<SpaceNetRow[]>([]);
  const [netsLoading, setNetsLoading] = useState(false);
  const [readyHint, setReadyHint] = useState<string | null>(null);

  const counts = useMemo(() => {
    const out: Record<SpaceKind, number> = {
      personal: 0,
      group: 0,
      building: 0,
      org: 0,
    };
    for (const ws of chrome.workspaces) {
      out[spaceKindForTemplate(ws.template)] += 1;
    }
    return out;
  }, [chrome.workspaces]);

  const kindSections = useMemo(
    () => [
      {
        key: "life-domains",
        label: "حوزه‌های زندگی مالی",
        description:
          "مانده و گزارش تجمیعی هر حوزه جداست؛ ثبت خرج داخل همان فضا",
        items: kindDomainMosaicItems(counts),
      },
    ],
    [counts],
  );

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
    if (!chrome.ready || chrome.workspaces.length === 0) {
      setNets([]);
      return;
    }
    let cancelled = false;
    setNetsLoading(true);
    void (async () => {
      try {
        const dash = await api.personalDashboard();
        if (cancelled) return;
        const byId = new Map(
          dash.finance.workspaces.map((line) => [line.workspaceId, line] as const),
        );
        const rows: SpaceNetRow[] = [];
        for (const ws of chrome.workspaces) {
          const line = byId.get(ws.id);
          if (!line) continue;
          rows.push({
            workspaceId: ws.id,
            slug: ws.slug,
            name: ws.name,
            spaceKind: spaceKindForTemplate(ws.template),
            net: netFromIrrMinor(line.net.amountMinor),
            openSettlements: line.openSettlements,
          });
        }
        setNets(rows);
      } catch {
        if (!cancelled) setNets([]);
      } finally {
        if (!cancelled) setNetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chrome.ready, chrome.workspaces]);

  const empty = chrome.ready && chrome.workspaces.length === 0;

  return (
    <AppShell
      workspaceId=""
      workspaceName="خانه"
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <div className="appHomeMosaic">
        <PageHeader
          eyebrow="دنگ همکاری"
          title="خانه"
          description="حوزه را باز کنید. گزارش تجمیعی بالای فهرست همان حوزه است؛ ثبت خرج و تسویه داخل هر فضا."
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
          <ContentSkeleton rows={3} label="در حال بارگذاری خانه…" />
        ) : (
          <ProductGrid>
            {readyHint ? (
              <StatusLine>
                <StatusPill tone="ok">زیرساخت</StatusPill> {readyHint}
              </StatusLine>
            ) : null}

            <ContextualMosaicHub
              sections={kindSections}
              title="انتخاب حوزه"
              description={
                empty
                  ? "هنوز فضایی ندارید — کاشی خالی شما را به ساخت می‌برد."
                  : `${chrome.workspaces.length.toLocaleString("fa-IR")} فضای واقعی · از هدر هم حوزه را عوض کنید.`
              }
              compact={false}
              headingId="home-kind-mosaic"
            />

            {empty ? (
              <SectionCard title="شروع با دادهٔ واقعی" delayClass="delay2">
                <EmptyStateBlock
                  title="زیرساخت آماده است"
                  description="خانه، تب‌های حوزه، ساخت فضا و پیوستن با شناسه وصل‌اند. وقتی فضا بسازید، خرج و تسویه از همان API زنده می‌آید — نه عدد نمایشی."
                  action={
                    <div className="dataRowActions">
                      <Link href="/spaces/new?kind=group">
                        <span className="shell-v2__cta">ساخت گروه</span>
                      </Link>
                      <Link href="/spaces/new?kind=building" className="textButton">
                        ساختمان
                      </Link>
                      <Link href="/spaces/new?kind=org" className="textButton">
                        سازمان
                      </Link>
                      <Link href="/spaces/new?kind=personal" className="textButton">
                        شخصی
                      </Link>
                    </div>
                  }
                />
              </SectionCard>
            ) : (
              <SectionCard title="مانده به‌تفکیک نوع فضا" delayClass="delay2">
                <SpacesBalanceOverview rows={nets} loading={netsLoading} />
                <StatusLine>
                  <Link href="/spaces/reports?kind=group">گزارش گروهی</Link>
                  {" · "}
                  <Link href="/spaces/reports?kind=building">گزارش ساختمان</Link>
                  {" · "}
                  <Link href="/me/finance">{NAV_LABELS.personalFinance}</Link>
                </StatusLine>
              </SectionCard>
            )}
          </ProductGrid>
        )}
      </div>
    </AppShell>
  );
}
