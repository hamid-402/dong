"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PersonalFinanceOverviewResponse, PersonalResourcesSummary } from "@dang/contracts";
import { Amount } from "@dang/ui";
import { api } from "@/lib/api";
import { hubPathFor } from "@/lib/hub-links";
import { spaceKindForTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";

function monthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Hub home strip — personal wallets + month paid across spaces (API only). */
export function MosaicPersonalFinanceStrip() {
  const chrome = useAppChrome();
  const [resources, setResources] = useState<PersonalResourcesSummary | null>(null);
  const [overview, setOverview] = useState<PersonalFinanceOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chrome.ready) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [res, ov] = await Promise.all([
          api.personalResourcesSummary(),
          api.personalFinanceOverview({ from: monthStart(), to: todayIso() }),
        ]);
        if (cancelled) return;
        setResources(res);
        setOverview(ov);
        setError(null);
      } catch {
        if (!cancelled) {
          setResources(null);
          setOverview(null);
          setError("بارگذاری مالیه شخصی ناموفق");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chrome.ready]);

  const topSpaces =
    overview?.workspaces
      .filter((w) => BigInt(w.paid.amountMinor) > 0n || BigInt(w.share.amountMinor) > 0n)
      .slice(0, 3) ?? [];

  return (
    <section className="mosaic-pf" aria-label="مالیه شخصی">
      <div className="mosaic-section-label">
        <b>مالیه من</b>
        <Link href={hubPathFor("/me")} className="mosaic-activity__all">
          دفتر من
        </Link>
      </div>

      {loading ? <p className="mosaic-activity__empty">در حال بارگذاری…</p> : null}
      {error ? <p className="mosaic-activity__empty">{error}</p> : null}

      {!loading && !error && resources ? (
        <div className="mosaic-pf__grid">
          <Link href={hubPathFor("/me")} className="mosaic-pf__card">
            <span className="mosaic-pf__label">موجودی حساب‌های فعال</span>
            <strong>
              <Amount irrMinor={resources.totalBalance.amountMinor} />
            </strong>
            <small>
              {resources.activeAccountCount} حساب ·{" "}
              {resources.persistence === "postgres" ? "Postgres" : "حافظه"}
            </small>
          </Link>

          <Link href={hubPathFor("/me")} className="mosaic-pf__card">
            <span className="mosaic-pf__label">پرداخت ماه جاری در همه فضاها</span>
            <strong>
              <Amount irrMinor={overview?.totals.paid.amountMinor ?? "0"} />
            </strong>
            <small>
              سهم مصرف: <Amount irrMinor={overview?.totals.share.amountMinor ?? "0"} />
            </small>
          </Link>

          {resources.currentMonthBudget ? (
            <Link href={hubPathFor("/me")} className="mosaic-pf__card">
              <span className="mosaic-pf__label">
                بودجه {resources.currentMonthBudget.yearMonth}
              </span>
              <strong>
                <Amount irrMinor={resources.currentMonthBudget.remaining.amountMinor} />
              </strong>
              <small>
                {resources.currentMonthBudget.usedPercent}٪ مصرف · آستانه{" "}
                {resources.currentMonthBudget.alertPercent}٪
                {resources.currentMonthBudget.alertLevel !== "ok"
                  ? ` · ${resources.currentMonthBudget.alertLevel === "exceeded" ? "تمام" : "هشدار"}`
                  : ""}
              </small>
            </Link>
          ) : (
            <Link href={hubPathFor("/me")} className="mosaic-pf__card mosaic-pf__card--muted">
              <span className="mosaic-pf__label">بودجه ماهانه</span>
              <strong>تعریف نشده</strong>
              <small>از دفتر من سقف بگذارید</small>
            </Link>
          )}
        </div>
      ) : null}

      {!loading && topSpaces.length > 0 ? (
        <ul className="mosaic-pf__spaces">
          {topSpaces.map((line) => (
            <li key={line.workspaceId}>
              <span>
                {line.workspaceName}
                <small> · {spaceKindForTemplateLabel(line.spaceKind)}</small>
              </span>
              <b>
                <Amount irrMinor={line.paid.amountMinor} />
              </b>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
