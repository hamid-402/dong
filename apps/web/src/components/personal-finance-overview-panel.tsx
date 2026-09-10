"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  PersonalFinanceMetricFocus,
  PersonalFinanceOverviewResponse,
  PersonalFinanceTrendGroupBy,
  PersonalFinanceTrendsResponse,
} from "@dang/contracts";
import { resolveDailyLedgerRange } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { JalaliDateField } from "@/components/jalali-date-field";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { spaceKindForTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

function monthStart(): string {
  return resolveDailyLedgerRange("month").from;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function spaceHomeHref(
  workspaceId: string,
  spaceKind: "personal" | "group" | "org",
  workspaces: Array<{ id: string; slug: string }>,
): string {
  const slug = workspaces.find((workspace) => workspace.id === workspaceId)?.slug;
  if (slug) return wPath(slug, "space");
  if (spaceKind === "personal") return hubPathFor("/me");
  if (spaceKind === "org") return hubPathFor("/orgs");
  return hubPathFor("/group");
}

/** Cross-workspace personal finance — only API-backed numbers. */
export function PersonalFinanceOverviewPanel() {
  const chrome = useAppChrome();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso);
  const [focus, setFocus] = useState<PersonalFinanceMetricFocus>("paid");
  const [groupBy, setGroupBy] = useState<PersonalFinanceTrendGroupBy>("day");
  const [overview, setOverview] = useState<PersonalFinanceOverviewResponse | null>(null);
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);
  const [trends, setTrends] = useState<PersonalFinanceTrendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    startTransition(() => {
      void (async () => {
        try {
          const [dash, tr] = await Promise.all([
            api.personalDashboard(from, to),
            api.personalFinanceTrends({ from, to, groupBy }),
          ]);
          setOverview(dash.finance);
          setWorkspaceCount(dash.workspaceCount);
          setTrends(tr);
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بارگذاری مالیه شخصی ناموفق"));
        }
      })();
    });
  }

  useEffect(() => {
    if (!chrome.ready) return;
    load();
    // initial load for default month range when chrome is ready
  }, [chrome.ready]);

  const maxTrend = trends
    ? trends.buckets.reduce((max, b) => {
        const n =
          BigInt(b.paid.amountMinor) +
          BigInt(b.share.amountMinor) +
          BigInt(b.personalExpense.amountMinor);
        return n > max ? n : max;
      }, 0n)
    : 0n;

  return (
    <SectionCard title="مالیه من در همه فضاها" delayClass="delay1">
      <FormStack>
        <StatusLine>
          پرداخت از جیب، سهم مصرف، و مانده فعلی هر گروه/سازمان — جدا از هم.
        </StatusLine>
        <div className="pfRangeRow">
          <JalaliDateField label="از تاریخ" value={from} onChange={setFrom} />
          <JalaliDateField label="تا تاریخ" value={to} onChange={setTo} />
          <Button type="button" onClick={load} disabled={pending}>
            {pending ? "در حال محاسبه…" : "اعمال بازه"}
          </Button>
          <Button
            type="button"
            onClick={() => {
              startTransition(() => {
                void (async () => {
                  try {
                    const created = await api.createPersonalFinanceExport({
                      from,
                      to,
                      kind: "overview",
                      idempotencyKey: newClientId(),
                    });
                    if (!created.hasFile) {
                      setError(created.errorDetail || "فایل CSV آماده نشد");
                      return;
                    }
                    window.open(
                      api.downloadPersonalFinanceExportUrl(created.id),
                      "_blank",
                    );
                    setError(null);
                  } catch (err: unknown) {
                    setError(friendlyErrorMessage(err, "خروجی ناموفق"));
                  }
                })();
              });
            }}
            disabled={pending}
          >
            CSV فضاها
          </Button>
        </div>

        <div className="pfFocusRow" role="tablist" aria-label="معیار نمایش">
          {(
            [
              ["paid", "پرداخت من"],
              ["share", "سهم مصرف"],
              ["net", "مانده فعلی"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={focus === id}
              className={focus === id ? "pfFocusChip isActive" : "pfFocusChip"}
              onClick={() => setFocus(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {error ? <p className="liveError">{error}</p> : null}

        {!overview && !error ? (
          <EmptyHint>در حال بارگذاری…</EmptyHint>
        ) : null}

        {overview ? (
          <>
            <div className="pfTotals">
              <div>
                <span className="pfTotalsLabel">جمع پرداخت در بازه</span>
                <Amount irrMinor={overview.totals.paid.amountMinor} />
              </div>
              <div>
                <span className="pfTotalsLabel">جمع سهم مصرف در بازه</span>
                <Amount irrMinor={overview.totals.share.amountMinor} />
              </div>
            </div>
            <StatusLine>
              {workspaceCount != null ? `${workspaceCount} فضا · ` : null}
              منبع: خرج {overview.source.expense === "postgres" ? "Postgres" : "حافظه"} · دفترکل{" "}
              {overview.source.ledger === "postgres" ? "Postgres" : "حافظه"} ·{" "}
              {overview.from} تا {overview.to}
            </StatusLine>

            {overview.workspaces.length === 0 ? (
              <EmptyHint>هنوز عضویت فضایی ندارید.</EmptyHint>
            ) : (
              <DataList>
                {overview.workspaces.map((line) => {
                  const primary =
                    focus === "paid"
                      ? line.paid.amountMinor
                      : focus === "share"
                        ? line.share.amountMinor
                        : line.net.amountMinor;
                  return (
                    <DataRow
                      key={line.workspaceId}
                      title={line.workspaceName}
                      meta={
                        <span className="pfRowMeta">
                          {spaceKindForTemplateLabel(line.spaceKind)}
                          {line.expenseCount > 0
                            ? ` · ${line.expenseCount} خرج در بازه`
                            : " · بدون خرج در بازه"}
                          {focus !== "paid" ? (
                            <>
                              {" "}
                              · پرداخت <Amount irrMinor={line.paid.amountMinor} />
                            </>
                          ) : null}
                          {focus !== "share" ? (
                            <>
                              {" "}
                              · سهم <Amount irrMinor={line.share.amountMinor} />
                            </>
                          ) : null}
                          {focus !== "net" ? (
                            <>
                              {" "}
                              · مانده <Amount irrMinor={line.net.amountMinor} />
                            </>
                          ) : null}
                        </span>
                      }
                      trailing={
                        <Link
                          href={spaceHomeHref(line.workspaceId, line.spaceKind, chrome.workspaces)}
                          className="pfRowLink"
                          onClick={() => chrome.selectWorkspace(line.workspaceId)}
                        >
                          <Amount irrMinor={primary} />
                        </Link>
                      }
                    />
                  );
                })}
              </DataList>
            )}
          </>
        ) : null}

        {trends ? (
          <div className="pfTrends">
            <StatusLine>سری زمانی (فقط داده واقعی API)</StatusLine>
            <div className="pfFocusRow" role="tablist" aria-label="گروه‌بندی زمان">
              {(
                [
                  ["day", "روز"],
                  ["week", "هفته"],
                  ["month", "ماه"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={groupBy === id}
                  className={groupBy === id ? "pfFocusChip isActive" : "pfFocusChip"}
                  onClick={() => {
                    setGroupBy(id);
                    startTransition(() => {
                      void (async () => {
                        try {
                          const tr = await api.personalFinanceTrends({
                            from,
                            to,
                            groupBy: id,
                          });
                          setTrends(tr);
                          setError(null);
                        } catch (err: unknown) {
                          setError(friendlyErrorMessage(err, "بارگذاری روند ناموفق"));
                        }
                      })();
                    });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {trends.buckets.length === 0 ? (
              <EmptyHint>در این بازه تراکنشی نیست.</EmptyHint>
            ) : (
              <ul className="pfTrendList">
                {trends.buckets.map((b) => {
                  const total =
                    BigInt(b.paid.amountMinor) +
                    BigInt(b.share.amountMinor) +
                    BigInt(b.personalExpense.amountMinor);
                  const pct = maxTrend > 0n ? Number((total * 100n) / maxTrend) : 0;
                  return (
                    <li key={b.key}>
                      <div className="pfTrendMeta">
                        <span>{b.label}</span>
                        <b>
                          <Amount irrMinor={b.paid.amountMinor} />
                        </b>
                      </div>
                      <div
                        className="pfTrendBar"
                        style={{ width: `${Math.max(4, pct)}%` }}
                        aria-hidden
                      />
                      <small>
                        سهم <Amount irrMinor={b.share.amountMinor} /> · شخصی{" "}
                        <Amount irrMinor={b.personalExpense.amountMinor} />
                        {b.expenseCount > 0 ? ` · ${b.expenseCount} خرج` : ""}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}
            <StatusLine>
              جمع شخصی در بازه:{" "}
              <Amount irrMinor={trends.totals.personalExpense.amountMinor} /> · منبع{" "}
              {trends.source.expense === "postgres" ? "Postgres" : "حافظه"}/
              {trends.source.personal === "postgres" ? "Postgres" : "حافظه"}
            </StatusLine>
          </div>
        ) : null}
      </FormStack>
    </SectionCard>
  );
}
