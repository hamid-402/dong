"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  MONEY_INTENT_KIND_CATALOG,
  moneyPulseFlowSeries,
  moneyPulseWhereWentSeries,
  spaceKindForTemplate,
  type ChartSeriesResponse,
  type PettyCashFundSummary,
  type SpaceKind,
  type WorkspaceMoneyMovement,
  type WorkspaceMoneyPulse,
} from "@dang/contracts";
import { Amount } from "@dang/ui";
import { ProChart } from "@/components/charts/pro-chart";
import { TreasuryBalanceCard } from "@/components/shell/treasury-balance-card";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { formatFaDate } from "@/lib/fa-datetime";
import { useAppChrome } from "@/lib/use-app-chrome";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";
import { gemCssVars } from "@/lib/tile-gem-palettes";
import styles from "./home-money-command.module.css";

type TileKey = "income" | "expense" | "net" | "allocated" | "all";
type RangePreset = "month" | "30d" | "90d";

const TILES: Array<{ key: Exclude<TileKey, "all">; label: string; tone: string; gem: string }> = [
  { key: "income", label: "درآمد", tone: "in", gem: "teal" },
  { key: "expense", label: "هزینه", tone: "out", gem: "copper" },
  { key: "net", label: "خالص", tone: "net", gem: "blue" },
  { key: "allocated", label: "تخصیص‌شده", tone: "alloc", gem: "violet" },
];

function movementKindLabel(kind: WorkspaceMoneyMovement["kind"]): string {
  if (kind === "income") return "درآمد";
  if (kind === "expense") return "هزینه";
  if (kind === "settlement") return "تسویه";
  if (kind === "contribution") return "پس‌انداز/هدف";
  if (kind === "investment") return "سرمایه‌گذاری";
  if (kind === "installment") return "قسط";
  return "انتقال";
}

function hrefForMovement(slug: string, m: WorkspaceMoneyMovement): string {
  if (m.hrefHint === "me-finance") return "/me/finance#resources";
  if (m.hrefHint === "settlements") return wPath(slug, "settlements");
  if (m.hrefHint === "ledger") return wPath(slug, "ledger");
  if (m.hrefHint === "charts") return wPath(slug, "charts");
  return `${wPath(slug, "expenses")}#quick-expense`;
}

function countForTile(pulse: WorkspaceMoneyPulse, key: Exclude<TileKey, "all">): number {
  if (key === "income") return pulse.counts.income + pulse.counts.transfer;
  if (key === "expense") return pulse.counts.expense + pulse.counts.installment;
  if (key === "allocated")
    return pulse.counts.contribution + pulse.counts.settlement + pulse.counts.investment;
  return pulse.movements.length;
}

function flowPercents(pulse: WorkspaceMoneyPulse): { inPct: number; outPct: number } {
  const inc = Math.abs(Number(pulse.income.amountMinor));
  const exp = Math.abs(Number(pulse.expense.amountMinor));
  const sum = inc + exp;
  if (sum <= 0) return { inPct: 0, outPct: 0 };
  return {
    inPct: Math.round((inc / sum) * 100),
    outPct: Math.round((exp / sum) * 100),
  };
}

export function rangeForPreset(preset: RangePreset): { from: string; to: string } {
  const to = new Date();
  const toIso = to.toISOString().slice(0, 10);
  if (preset === "month") {
    const from = `${to.getUTCFullYear()}-${String(to.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: toIso };
  }
  const days = preset === "30d" ? 30 : 90;
  const fromDate = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: fromDate.toISOString().slice(0, 10), to: toIso };
}

function monthsForRange(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 6;
  const days = Math.max(1, Math.round((b - a) / 86_400_000) + 1);
  return Math.min(36, Math.max(1, Math.ceil(days / 30)));
}

function detectPreset(from: string, to: string): RangePreset {
  const month = rangeForPreset("month");
  if (from === month.from && to === month.to) return "month";
  const d30 = rangeForPreset("30d");
  if (from === d30.from && to === d30.to) return "30d";
  const d90 = rangeForPreset("90d");
  if (from === d90.from && to === d90.to) return "90d";
  return "month";
}

function groupByDay(
  rows: readonly WorkspaceMoneyMovement[],
): Array<{ day: string; items: WorkspaceMoneyMovement[] }> {
  const map = new Map<string, WorkspaceMoneyMovement[]>();
  for (const m of rows) {
    const list = map.get(m.occurredOn) ?? [];
    list.push(m);
    map.set(m.occurredOn, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, items]) => ({ day, items }));
}

/**
 * Home money command — live pulse tiles, range presets, day-grouped feed,
 * allocation split, and charts gated by charts_v1 / plan.
 */
export function HomeMoneyCommand({
  workspaceId,
  slug,
  pulse,
  rangeLabel,
  from,
  to,
  onRangeChange,
  spaceKind,
  pettyCashFunds,
  savingsBalanceMinor,
  savingsGoalCount,
}: {
  workspaceId: string;
  slug: string;
  pulse: WorkspaceMoneyPulse;
  rangeLabel: string;
  from: string;
  to: string;
  onRangeChange?: (from: string, to: string) => void;
  spaceKind?: SpaceKind;
  pettyCashFunds?: PettyCashFundSummary[];
  savingsBalanceMinor?: string | null;
  savingsGoalCount?: number;
}) {
  const chrome = useAppChrome();
  const chartsOn = chrome.capabilities?.providers?.charts === "charts_v1";
  const goalsOn = chrome.capabilities?.providers?.savingsGoals === "goals_v1";
  const resolvedKind =
    spaceKind ??
    spaceKindForTemplate(
      chrome.workspaces.find((w) => w.id === workspaceId)?.template,
    );
  const [open, setOpen] = useState<TileKey>("all");
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState<RangePreset>(() => detectPreset(from, to));
  const [trend, setTrend] = useState<ChartSeriesResponse | null>(null);
  const [mix, setMix] = useState<ChartSeriesResponse | null>(null);
  const [share, setShare] = useState<ChartSeriesResponse | null>(null);
  const [incomeVs, setIncomeVs] = useState<ChartSeriesResponse | null>(null);
  const [goalProgress, setGoalProgress] = useState<ChartSeriesResponse | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const flow = useMemo(() => moneyPulseFlowSeries(pulse.movements), [pulse.movements]);
  const whereWent = useMemo(() => moneyPulseWhereWentSeries(pulse), [pulse]);
  const flowBar = flowPercents(pulse);
  const netNegative = BigInt(pulse.net.amountMinor) < 0n;
  const rate = pulse.savingsRatePercent;
  const intents = pulse.intents ?? [];
  const intentsOn = chrome.capabilities?.providers?.moneyIntents === "intents_v1";
  const chartMonths = monthsForRange(from, to);

  useEffect(() => {
    setPreset(detectPreset(from, to));
  }, [from, to]);

  useEffect(() => {
    if (!chartsOn || !workspaceId) {
      setTrend(null);
      setMix(null);
      setShare(null);
      setIncomeVs(null);
      setGoalProgress(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const [t, m, s] = await Promise.all([
            api.workspaceChartExpenseTrend(workspaceId, chartMonths),
            api.workspaceChartCategoryMix(workspaceId, from, to),
            api.workspaceChartMemberShare(workspaceId, from, to),
          ]);
          setTrend(t);
          setMix(m);
          setShare(s);
          setChartError(null);
          if (pulse.scope === "personal_linked") {
            try {
              const iv = await api.personalChartIncomeVsExpense(chartMonths);
              setIncomeVs(iv);
            } catch {
              setIncomeVs(null);
            }
            if (goalsOn) {
              try {
                const gp = await api.personalChartGoalProgress();
                setGoalProgress(gp);
              } catch {
                setGoalProgress(null);
              }
            } else {
              setGoalProgress(null);
            }
          } else {
            setIncomeVs(null);
            setGoalProgress(null);
          }
        } catch (err: unknown) {
          setTrend(null);
          setMix(null);
          setShare(null);
          setIncomeVs(null);
          setGoalProgress(null);
          setChartError(friendlyErrorMessage(err, "خواندن نمودار خانه ممکن نشد"));
        }
      })();
    });
  }, [workspaceId, chartsOn, pulse.scope, from, to, chartMonths, goalsOn]);

  const amountFor = (key: Exclude<TileKey, "all">) => {
    if (key === "income") return pulse.income;
    if (key === "expense") return pulse.expense;
    if (key === "net") return pulse.net;
    return pulse.allocated;
  };

  const filteredMovements = useMemo(() => {
    let rows = pulse.movements;
    if (open === "income") {
      rows = rows.filter(
        (m) => m.kind === "income" || (m.kind === "transfer" && m.direction === "in"),
      );
    } else if (open === "expense") {
      rows = rows.filter((m) => m.kind === "expense" || m.kind === "installment");
    } else if (open === "allocated") {
      rows = rows.filter(
        (m) =>
          m.kind === "contribution" ||
          m.kind === "settlement" ||
          m.kind === "investment",
      );
    } else if (open === "net") {
      rows = rows.filter(
        (m) =>
          m.kind === "income" ||
          m.kind === "expense" ||
          m.kind === "installment" ||
          m.kind === "investment",
      );
    }
    const q = query.trim();
    if (q) {
      rows = rows.filter(
        (m) => m.title.includes(q) || movementKindLabel(m.kind).includes(q),
      );
    }
    return rows;
  }, [pulse.movements, open, query]);

  const dayGroups = useMemo(() => groupByDay(filteredMovements), [filteredMovements]);
  const localFlowChart: ChartSeriesResponse | null =
    flow.points.length > 0 ? flow : null;

  return (
    <section className={styles.root} aria-label="پول‌نمای فرمان فضا">
      {resolvedKind === "personal" ||
      chrome.capabilities?.providers?.pettyCash === "fund_v1" ? (
        <div style={{ marginBottom: "0.85rem" }}>
          <TreasuryBalanceCard
            spaceKind={resolvedKind}
            funds={pettyCashFunds ?? []}
            paymentsHref={
              resolvedKind === "personal"
                ? "/me/finance#goals"
                : wPath(slug, "payments")
            }
            savingsHref="/me/finance#goals"
            canManage={false}
            density="compact"
            savingsBalanceMinor={
              resolvedKind === "personal"
                ? (savingsBalanceMinor ?? (goalsOn ? "0" : null))
                : null
            }
            savingsGoalCount={savingsGoalCount}
          />
        </div>
      ) : null}
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>مرکز فرمان پول</p>
          <h2 className={styles.title}>همه جریان‌های مالی این فضا</h2>
          <p className={styles.sub}>
            {rangeLabel}
            <span className={styles.scopeChip}>
              {pulse.scope === "personal_linked" ? "شخصی + فضا" : "فقط فضا"}
            </span>
            {rate != null ? (
              <span
                className={`${styles.rateChip}${rate < 0 ? ` ${styles.rateNeg}` : ""}`}
                title="نسبت خالص به درآمد از دادهٔ همین بازه"
              >
                نرخ پس‌انداز {rate.toLocaleString("fa-IR")}٪
              </span>
            ) : null}
          </p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.presets} role="group" aria-label="بازه زمانی">
            {(
              [
                ["month", "این ماه"],
                ["30d", "۳۰ روز"],
                ["90d", "۹۰ روز"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`${styles.preset}${preset === id ? ` ${styles.presetActive}` : ""}`}
                onClick={() => {
                  setPreset(id);
                  const next = rangeForPreset(id);
                  onRangeChange?.(next.from, next.to);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <Link className="textButton" href={wPath(slug, "charts")}>
            گزارش کامل
          </Link>
        </div>
      </header>

      <div className={styles.quick}>
        <Link className={styles.quickBtn} href={wPath(slug, "record")}>
          {NAV_LABELS.addExpense}
        </Link>
        <Link className={styles.quickBtn} href="/me/finance#lifestyle">
          تراز زندگی / حقوق
        </Link>
        <Link className={styles.quickBtn} href="/me/finance#resources">
          ثبت درآمد / منابع
        </Link>
        <Link className={styles.quickBtn} href="/me/finance#resources">
          قسط / سرمایه‌گذاری
        </Link>
        {goalsOn ? (
          <Link className={styles.quickBtn} href="/me/finance#goals">
            اهداف و پس‌انداز
          </Link>
        ) : null}
        {intentsOn ? (
          <Link className={styles.quickBtn} href="/me/finance#intents">
            قواعد مالی
          </Link>
        ) : null}
        {resolvedKind !== "personal" ? (
          <Link className={styles.quickBtn} href={wPath(slug, "ledger")}>
            {NAV_LABELS.ledger}
          </Link>
        ) : null}
        <Link className={styles.quickBtn} href={wPath(slug, "settlements")}>
          تسویه‌ها
        </Link>
      </div>

      <div className={styles.tiles}>
        {TILES.map((tile) => {
          const money = amountFor(tile.key);
          const active = open === tile.key;
          const count = countForTile(pulse, tile.key);
          return (
            <button
              key={tile.key}
              type="button"
              className={`dang-gem ${styles.tile} ${styles[`tone_${tile.tone}`] ?? ""}${active ? ` ${styles.tileActive}` : ""}`}
              style={gemCssVars(tile.gem)}
              onClick={() => setOpen(active ? "all" : tile.key)}
              aria-expanded={active}
              aria-controls="home-money-detail"
            >
              <span className={styles.tileTop}>
                <span className={styles.tileLabel}>{tile.label}</span>
                <span className={styles.tileCount}>{count.toLocaleString("fa-IR")}</span>
              </span>
              <span
                className={`${styles.tileAmount}${tile.key === "net" && netNegative ? ` ${styles.tileNeg}` : ""}`}
              >
                <Amount irrMinor={money.amountMinor} />
              </span>
              <span className={styles.tileHint}>
                {active ? "نمایش همه" : "جزئیات"}
              </span>
            </button>
          );
        })}
      </div>

      {(flowBar.inPct > 0 || flowBar.outPct > 0) && (
        <div className={styles.flow} aria-label="نسبت درآمد به هزینه">
          <div className={styles.flowLabels}>
            <span>ورودی {flowBar.inPct.toLocaleString("fa-IR")}٪</span>
            <span>خروجی {flowBar.outPct.toLocaleString("fa-IR")}٪</span>
          </div>
          <div className={styles.flowTrack}>
            <span className={styles.flowIn} style={{ width: `${flowBar.inPct}%` }} />
            <span className={styles.flowOut} style={{ width: `${flowBar.outPct}%` }} />
          </div>
        </div>
      )}

      {(BigInt(pulse.allocation.goals.amountMinor) > 0n ||
        BigInt(pulse.allocation.settlements.amountMinor) > 0n ||
        BigInt(pulse.allocation.liquid.amountMinor) > 0n ||
        BigInt(pulse.allocation.investments.amountMinor) > 0n ||
        BigInt(pulse.allocation.installments.amountMinor) > 0n) && (
        <div className={styles.allocRow} aria-label="شکست تخصیص و مانده">
          <div className={styles.allocCard}>
            <span>اهداف / پس‌انداز</span>
            <strong>
              <Amount irrMinor={pulse.allocation.goals.amountMinor} />
            </strong>
          </div>
          <div className={styles.allocCard}>
            <span>سرمایه‌گذاری</span>
            <strong>
              <Amount irrMinor={pulse.allocation.investments.amountMinor} />
            </strong>
          </div>
          <div className={styles.allocCard}>
            <span>اقساط</span>
            <strong>
              <Amount irrMinor={pulse.allocation.installments.amountMinor} />
            </strong>
          </div>
          <div className={styles.allocCard}>
            <span>تسویه / بدهی باز</span>
            <strong>
              <Amount irrMinor={pulse.allocation.settlements.amountMinor} />
            </strong>
          </div>
          <div className={styles.allocCard}>
            <span>مانده حساب‌ها</span>
            <strong>
              <Amount irrMinor={pulse.allocation.liquid.amountMinor} />
            </strong>
          </div>
        </div>
      )}

      {intents.length > 0 ? (
        <div className={styles.goalsList} aria-label="قواعد و اهداف مالی بازه">
          <div className={styles.goalsListHead}>
            <strong>قواعد و اهداف شما</strong>
            <Link href="/me/finance#intents">مدیریت</Link>
          </div>
          <ul>
            {intents.map((item) => (
              <li
                key={item.intentId}
                className={
                  item.met === true
                    ? styles.intentRowMet
                    : item.met === false
                      ? styles.intentRowMiss
                      : undefined
                }
              >
                <div className={styles.goalRowTop}>
                  <span>
                    {item.name}
                    <small className={styles.intentKind}> · {item.kindLabelFa}</small>
                  </span>
                  <span
                    className={
                      item.met === true
                        ? styles.intentMet
                        : item.met === false
                          ? styles.intentMiss
                          : styles.intentUnk
                    }
                  >
                    {item.met === true
                      ? "برآورده"
                      : item.met === false
                        ? "نرسیده"
                        : "غیرقابل سنجش"}
                  </span>
                </div>
                {item.progressPercent != null ? (
                  <div className={styles.goalTrack} aria-hidden>
                    <span
                      className={styles.goalFill}
                      style={{
                        width: `${Math.min(100, Math.max(0, item.progressPercent))}%`,
                      }}
                    />
                  </div>
                ) : null}
                <div className={styles.goalRowMeta}>
                  <span>{item.actualLabel}</span>
                  <span>/</span>
                  <span>{item.targetLabel}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : intentsOn ? (
        <StatusLine>
          هنوز قاعده یا هدف مالی تعریف نشده. از{" "}
          <Link href="/me/finance#intents">مالی من → قواعد</Link> هر نوعی که لازم دارید
          بسازید ({MONEY_INTENT_KIND_CATALOG.length.toLocaleString("fa-IR")} نوع پشتیبانی‌شده).
        </StatusLine>
      ) : null}

      {pulse.goals.length > 0 ? (
        <div className={styles.goalsList} aria-label="پیشرفت اهداف پس‌انداز">
          <div className={styles.goalsListHead}>
            <strong>اهداف پس‌انداز</strong>
            <Link href="/me/finance#goals">مدیریت</Link>
          </div>
          <ul>
            {pulse.goals.map((g) => (
              <li key={g.id}>
                <div className={styles.goalRowTop}>
                  <span>{g.name}</span>
                  <span>
                    {Math.min(g.progressPercent, 999).toLocaleString("fa-IR")}٪
                    {g.status === "reached" ? " · تکمیل" : ""}
                  </span>
                </div>
                <div className={styles.goalTrack} aria-hidden>
                  <span
                    className={styles.goalFill}
                    style={{ width: `${Math.min(100, Math.max(0, g.progressPercent))}%` }}
                  />
                </div>
                <div className={styles.goalRowMeta}>
                  <Amount irrMinor={g.contributed.amountMinor} />
                  <span>از</span>
                  <Amount irrMinor={g.target.amountMinor} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div id="home-money-detail" className={styles.detail}>
        <div className={styles.detailHead}>
          <strong>
            {open === "all"
              ? `حرکت‌ها (${filteredMovements.length.toLocaleString("fa-IR")})`
              : `${TILES.find((t) => t.key === open)?.label ?? "جزئیات"} (${filteredMovements.length.toLocaleString("fa-IR")})`}
          </strong>
          <input
            className={styles.search}
            type="search"
            placeholder="جستجو در عنوان…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="جستجو در حرکت‌های مالی"
          />
        </div>
        {dayGroups.length === 0 ? (
          <EmptyHint>
            در بازه {formatFaDate(from)} تا {formatFaDate(to)} موردی برای این فیلتر نیست. از
            دکمه‌های سریع بالا ثبت کنید.
          </EmptyHint>
        ) : (
          <ul className={styles.list}>
            {dayGroups.map((group) => (
              <li key={group.day} className={styles.dayGroup}>
                <div className={styles.dayLabel}>{formatFaDate(group.day)}</div>
                <ul className={styles.dayItems}>
                  {group.items.map((m) => (
                    <li key={`${m.kind}-${m.id}`}>
                      <Link href={hrefForMovement(slug, m)} className={styles.row}>
                        <span className={styles.rowMeta}>
                          <span className={styles.rowKind}>{movementKindLabel(m.kind)}</span>
                          <span className={styles.rowTitle}>{m.title}</span>
                        </span>
                        <span
                          className={
                            m.direction === "in" ? styles.amountIn : styles.amountOut
                          }
                        >
                          {m.direction === "in" ? "+" : "−"}
                          <Amount irrMinor={m.amount.amountMinor} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pulse.notes.length > 0 ? (
        <StatusLine>{pulse.notes.slice(0, 4).join(" · ")}</StatusLine>
      ) : null}

      <div className={styles.charts}>
        {localFlowChart ? (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>جریان درآمد / هزینه (همین بازه)</h3>
            <ProChart
              title="جریان پول"
              series={localFlowChart}
              variant="dualColumn"
              primaryLabel="درآمد"
              secondaryLabel="هزینه"
              compact
            />
          </div>
        ) : null}
        {whereWent.points.length > 0 ? (
          <div className={styles.chartCard}>
            <h3 className={styles.chartTitle}>پول کجا رفت؟</h3>
            <ProChart
              title="تخصیص خروجی"
              series={whereWent}
              variant="donut"
              compact
            />
          </div>
        ) : null}

        {!chartsOn ? (
          <EmptyHint>
            نمودار آماری فضای کاری وقتی charts_v1 روشن باشد اینجا کامل می‌شود.{" "}
            <Link href="/spaces/reports">گزارش حوزه</Link>
          </EmptyHint>
        ) : (
          <>
            {chartError ? <StatusLine>{chartError}</StatusLine> : null}
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>روند خرج فضا</h3>
              <ProChart
                title="روند خرج"
                series={trend}
                loading={pending && !trend}
                variant="line"
                primaryLabel="خرج"
                compact
              />
            </div>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>ترکیب دسته</h3>
              <ProChart
                title="دسته"
                series={mix}
                loading={pending && !mix}
                variant="donut"
                compact
              />
            </div>
            <div className={styles.chartCard}>
              <h3 className={styles.chartTitle}>سهم اعضا</h3>
              <ProChart
                title="سهم"
                series={share}
                loading={pending && !share}
                variant="donut"
                compact
              />
            </div>
            {incomeVs ? (
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>درآمد در برابر هزینهٔ شخصی</h3>
                <ProChart
                  title="شخصی"
                  series={incomeVs}
                  variant="dualColumn"
                  primaryLabel="درآمد"
                  secondaryLabel="هزینه"
                  compact
                />
              </div>
            ) : null}
            {goalProgress ? (
              <div className={styles.chartCard}>
                <h3 className={styles.chartTitle}>پیشرفت اهداف پس‌انداز</h3>
                <ProChart
                  title="اهداف"
                  series={goalProgress}
                  variant="progress"
                  primaryLabel="پیشرفت"
                  compact
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
