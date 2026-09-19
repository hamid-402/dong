"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { SpaceKind } from "@dang/contracts";
import { ProChart } from "@/components/charts/pro-chart";
import { NAV_LABELS, spaceTabLabel } from "@/lib/nav-labels";
import { netsToShareSeries } from "@/lib/chart-format";
import type { SpaceNetRow } from "@/lib/space-net-balance";
import { wPath } from "@/lib/workspace-paths";

export type KindAggregateSpace = {
  id: string;
  slug: string;
  name: string;
};

const KIND_AGG_HINT: Record<SpaceKind, string> = {
  personal: "بودجه و روند شخصی در گزارش حوزه؛ ثبت خرج روزانه داخل دفتر همان فضا.",
  group: "صورتحساب و نمودار همهٔ گروه‌ها در گزارش تجمیعی؛ ثبت خرج و تسویه داخل هر گروه.",
  building: "خلاصه و گزارش همهٔ ساختمان‌ها اینجا؛ شارژ و دفتر داخل هر ساختمان.",
  org: "گزارش همهٔ سازمان‌ها اینجا؛ تدارکات و خرج داخل هر سازمان.",
};

/**
 * Kind-level aggregate strip on `/spaces?kind=…`.
 * Cross-space reports only — day-to-day ops stay inside each workspace.
 */
export function KindAggregatePanel({
  kind,
  spaces,
  rows,
  chartsAvailable = false,
}: {
  kind: SpaceKind;
  spaces: readonly KindAggregateSpace[];
  rows: readonly SpaceNetRow[];
  chartsAvailable?: boolean;
}) {
  const label = spaceTabLabel(kind);
  const titleId = `kind-aggregate-${kind}`;
  const reportsHref = `/spaces/reports?kind=${kind}&months=6`;
  const netShare = useMemo(() => netsToShareSeries(rows), [rows]);

  if (spaces.length === 0) {
    return (
      <section className="kindAggregate" aria-labelledby={titleId}>
        <header className="kindAggregate__head">
          <h2 id={titleId}>نمای کلی · {label}</h2>
          <p>{KIND_AGG_HINT[kind]}</p>
        </header>
        <p className="kindAggregate__empty">
          هنوز فضایی در این حوزه نیست. بعد از ساخت، گزارش و نمودار تجمیعی اینجا می‌آید.
        </p>
        <Link className="shell-v2__cta" href={`/spaces/new?kind=${kind}`}>
          ساخت فضای {label}
        </Link>
      </section>
    );
  }

  const ranked = [...spaces].sort((a, b) => {
    const na = Math.abs(rows.find((r) => r.workspaceId === a.id)?.net.toman ?? 0);
    const nb = Math.abs(rows.find((r) => r.workspaceId === b.id)?.net.toman ?? 0);
    return nb - na;
  });

  return (
    <section className="kindAggregate" aria-labelledby={titleId}>
      <header className="kindAggregate__head">
        <p className="kindAggregate__eyebrow">گزارش تجمیعی حوزه</p>
        <h2 id={titleId}>نمای کلی · {label}</h2>
        <p>{KIND_AGG_HINT[kind]}</p>
        <div className="kindAggregate__actions">
          <Link className="shell-v2__cta" href={reportsHref}>
            گزارش کامل و نمودارها
          </Link>
          {kind === "personal" ? (
            <Link className="textButton" href="/me/finance">
              {NAV_LABELS.personalFinance}
            </Link>
          ) : null}
        </div>
      </header>

      <div className="kindAggregate__grid kindAggregate__grid--report">
        <ProChart
          title="مقایسهٔ ماندهٔ فضاها"
          series={netShare}
          variant="hbar"
          primaryLabel="مانده (تومان)"
          compact
        />

        <div className="kindAggregate__card">
          <h3>صورتحساب‌های این حوزه</h3>
          <p className="kindAggregate__cardLead">
            فهرست همهٔ فضاها — جزئیات داخل همان فضا.
          </p>
          <ul className="kindAggregate__links">
            {ranked.map((space) => (
              <li key={space.id}>
                <Link href={wPath(space.slug, "invoices")}>
                  صورتحساب «{space.name}»
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="kindAggregate__card">
          <h3>نمودار و روند</h3>
          <p className="kindAggregate__cardLead">
            روند خرج تجمیعی، ترکیب دسته و جزئیات هر فضا در گزارش کامل.
          </p>
          <div className="kindAggregate__actions">
            <Link className="shell-v2__cta" href={reportsHref}>
              باز کردن گزارش {label}
            </Link>
            {chartsAvailable ? (
              <Link className="textButton" href={wPath(ranked[0]!.slug, "charts")}>
                نمودار «{ranked[0]!.name}»
              </Link>
            ) : (
              <p className="liveHint">نمودار فضای کاری با charts_v1 فعال می‌شود.</p>
            )}
          </div>
        </div>
      </div>

      <p className="kindAggregate__foot">
        ثبت خرج، دفتر روزانه و تسویهٔ اعضا فقط <strong>داخل هر فضا</strong>ست — از کاشی‌های پایین وارد شوید.
      </p>
    </section>
  );
}
