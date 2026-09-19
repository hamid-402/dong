"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  ChartSeriesResponse,
  WorkspaceMoneyMovement,
  WorkspaceMoneyPulse,
} from "@dang/contracts";
import { Amount } from "@dang/ui";
import { ProChart } from "@/components/charts/pro-chart";
import { EmptyHint, SectionCard, StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/api/client";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { formatFaDate } from "@/lib/fa-datetime";
import { rangeFromMonths } from "@/lib/chart-insights";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";
import styles from "./home-money-command.module.css";

type TileKey = "income" | "expense" | "net" | "allocated";

const TILES: Array<{ key: TileKey; label: string }> = [
  { key: "income", label: "درآمد" },
  { key: "expense", label: "هزینه" },
  { key: "net", label: "خالص" },
  { key: "allocated", label: "تخصیص‌شده" },
];

function movementKindLabel(kind: WorkspaceMoneyMovement["kind"]): string {
  if (kind === "income") return "درآمد";
  if (kind === "expense") return "هزینه";
  if (kind === "settlement") return "تسویه";
  if (kind === "contribution") return "پس‌انداز/هدف";
  return "انتقال";
}

function hrefForMovement(
  slug: string,
  m: WorkspaceMoneyMovement,
): string {
  if (m.hrefHint === "me-finance") return "/me/finance";
  if (m.hrefHint === "settlements") return wPath(slug, "settlements");
  if (m.hrefHint === "ledger") return wPath(slug, "ledger");
  if (m.hrefHint === "charts") return wPath(slug, "charts");
  return wPath(slug, "expenses");
}

/**
 * Home money command center — aggregate tiles + drill-down + live charts.
 * Renders only store-backed pulse from workspace dashboard (no invented series).
 */
export function HomeMoneyCommand({
  workspaceId,
  slug,
  pulse,
  rangeLabel,
}: {
  workspaceId: string;
  slug: string;
  pulse: WorkspaceMoneyPulse;
  rangeLabel: string;
}) {
  const chrome = useAppChrome();
  const chartsOn = chrome.capabilities?.providers?.charts === "charts_v1";
  const [open, setOpen] = useState<TileKey | null>(null);
  const [trend, setTrend] = useState<ChartSeriesResponse | null>(null);
  const [mix, setMix] = useState<ChartSeriesResponse | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [planDenied, setPlanDenied] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!chartsOn || !workspaceId) {
      setTrend(null);
      setMix(null);
      return;
    }
    const { from, to } = rangeFromMonths(6);
    startTransition(() => {
      void Promise.all([
        api.workspaceChartExpenseTrend(workspaceId, 6),
        api.workspaceChartCategoryMix(workspaceId, from, to),
      ])
        .then(([t, m]) => {
          setTrend(t);
          setMix(m);
          setPlanDenied(false);
          setChartError(null);
        })
        .catch((err: unknown) => {
          setTrend(null);
          setMix(null);
          if (
            err instanceof ApiError &&
            (err.code === "plan_required" ||
              /Plan upgrade required|در پلن .+ فعال نیست/i.test(err.message))
          ) {
            setPlanDenied(true);
            setChartError(null);
            return;
          }
          setPlanDenied(false);
          setChartError(friendlyErrorMessage(err, "خواندن نمودار خانه ممکن نشد"));
        });
    });
  }, [workspaceId, chartsOn]);

  const amountFor = (key: TileKey) => {
    if (key === "income") return pulse.income;
    if (key === "expense") return pulse.expense;
    if (key === "net") return pulse.net;
    return pulse.allocated;
  };

  const filteredMovements = (() => {
    if (!open) return [];
    if (open === "income") {
      return pulse.movements.filter(
        (m) => m.kind === "income" || (m.kind === "transfer" && m.direction === "in"),
      );
    }
    if (open === "expense") {
      return pulse.movements.filter((m) => m.kind === "expense");
    }
    if (open === "allocated") {
      return pulse.movements.filter(
        (m) => m.kind === "contribution" || m.kind === "settlement",
      );
    }
    return pulse.movements;
  })();

  return (
    <section className={styles.root} aria-label="پول‌نمای فرمان فضا">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>پول‌نمای فرمان</h2>
          <p className={styles.sub}>بازه: {rangeLabel}</p>
        </div>
        <Link className="textButton" href={wPath(slug, "charts")}>
          گزارش کامل
        </Link>
      </header>

      <div className={styles.tiles} role="list">
        {TILES.map((tile) => {
          const money = amountFor(tile.key);
          const active = open === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              role="listitem"
              className={`${styles.tile}${active ? ` ${styles.tileActive}` : ""}`}
              onClick={() => setOpen(active ? null : tile.key)}
              aria-expanded={active}
              aria-controls="home-money-detail"
            >
              <span className={styles.tileLabel}>{tile.label}</span>
              <span className={styles.tileAmount}>
                <Amount money={money} />
              </span>
              <span className={styles.tileHint}>
                {active ? "بستن جزئیات" : "جزئیات و موارد"}
              </span>
            </button>
          );
        })}
      </div>

      {open ? (
        <div id="home-money-detail" className={styles.detail}>
          <div className={styles.detailHead}>
            <strong>{TILES.find((t) => t.key === open)?.label}</strong>
            <button type="button" className="textButton" onClick={() => setOpen(null)}>
              بستن
            </button>
          </div>
          {filteredMovements.length === 0 ? (
            <EmptyHint>در این بازه موردی برای این کاشی ثبت نشده.</EmptyHint>
          ) : (
            <ul className={styles.list}>
              {filteredMovements.map((m) => (
                <li key={`${m.kind}-${m.id}`}>
                  <Link href={hrefForMovement(slug, m)} className={styles.row}>
                    <span className={styles.rowMeta}>
                      <span className={styles.rowKind}>{movementKindLabel(m.kind)}</span>
                      <span className={styles.rowTitle}>{m.title}</span>
                      <span className={styles.rowDate}>{formatFaDate(m.occurredOn)}</span>
                    </span>
                    <span
                      className={
                        m.direction === "in" ? styles.amountIn : styles.amountOut
                      }
                    >
                      <Amount money={m.amount} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {pulse.notes.length > 0 ? (
        <StatusLine>
          {pulse.notes.slice(0, 3).join(" · ")}
          {pulse.scope === "personal_linked" ? " · محدوده: شخصی+فضا" : " · محدوده: فضا"}
        </StatusLine>
      ) : null}

      <div className={styles.charts}>
        {!chartsOn ? (
          <EmptyHint>
            نمودار آماری وقتی providers.charts برابر charts_v1 باشد اینجا می‌آید.{" "}
            <Link href={`/spaces/reports`}>گزارش تجمیعی حوزه</Link>
          </EmptyHint>
        ) : planDenied ? (
          <EmptyHint>
            نمودارها پشت قابلیت analytics پلن هستند — دادهٔ جعلی نشان داده نمی‌شود.{" "}
            <Link href={wPath(slug, "settings")}>تنظیمات / پلن</Link>
          </EmptyHint>
        ) : (
          <>
            {chartError ? <StatusLine>{chartError}</StatusLine> : null}
            <SectionCard title="روند خرج فضا" delayClass="delay1">
              <ProChart
                title="روند خرج ماهانه"
                series={trend}
                loading={pending && !trend}
                variant="line"
                primaryLabel="خرج (تومان)"
                compact
              />
            </SectionCard>
            <SectionCard title="ترکیب دسته" delayClass="delay2">
              <ProChart
                title="ترکیب دسته‌بندی"
                series={mix}
                loading={pending && !mix}
                variant="donut"
                primaryLabel="جمع"
                compact
              />
            </SectionCard>
          </>
        )}
      </div>
    </section>
  );
}
