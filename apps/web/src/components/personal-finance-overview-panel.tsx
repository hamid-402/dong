"use client";

import { newClientId } from "@/lib/id";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  PersonalFinanceMetricFocus,
  PersonalFinanceOverviewResponse,
  PersonalFinanceOverviewScope,
  PersonalFinanceTrendGroupBy,
  PersonalFinanceTrendsResponse,
  SpaceKind,
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
import { formatFaDate, todayIsoLocal } from "@/lib/fa-datetime";
import { hubPathFor } from "@/lib/hub-links";
import { spaceKindForTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

function monthStart(): string {
  return resolveDailyLedgerRange("month").from;
}

function todayIso(): string {
  return todayIsoLocal();
}

function spaceHomeHref(
  workspaceId: string,
  spaceKind: SpaceKind,
  workspaces: Array<{ id: string; slug: string }>,
): string {
  const slug = workspaces.find((workspace) => workspace.id === workspaceId)?.slug;
  if (slug) return wPath(slug, "space");
  if (spaceKind === "personal") return hubPathFor("/me");
  if (spaceKind === "building") return hubPathFor("/group");
  if (spaceKind === "org") return hubPathFor("/orgs");
  return hubPathFor("/group");
}

/** Cross-workspace personal finance � only API-backed numbers. */
export function PersonalFinanceOverviewPanel() {
  const chrome = useAppChrome();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(todayIso);
  const [scope, setScope] = useState<PersonalFinanceOverviewScope>("combined");
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
          const [dash, ov, tr] = await Promise.all([
            api.personalDashboard(from, to),
            api.personalFinanceOverview({ from, to, scope }),
            api.personalFinanceTrends({ from, to, groupBy }),
          ]);
          setOverview(ov);
          setWorkspaceCount(dash.workspaceCount);
          setTrends(tr);
          setError(null);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "???????? ????? ???? ??????"));
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
    <SectionCard title="????? ?? ?? ??? ?????" delayClass="delay1">
      <FormStack>
        <StatusLine>
          ?????? ?? ???? ??? ????? ? ????? ???? ?? ????/?????? � ??? ?? ??.
        </StatusLine>
        <div className="pfRangeRow">
          <JalaliDateField label="?? ?????" value={from} onChange={setFrom} />
          <JalaliDateField label="?? ?????" value={to} onChange={setTo} />
          <Button type="button" onClick={load} disabled={pending}>
            {pending ? "?? ??? ??????�" : "????? ????"}
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
                      setError(created.errorDetail || "???? CSV ????? ???");
                      return;
                    }
                    window.open(
                      api.downloadPersonalFinanceExportUrl(created.id),
                      "_blank",
                    );
                    setError(null);
                  } catch (err: unknown) {
                    setError(friendlyErrorMessage(err, "????? ??????"));
                  }
                })();
              });
            }}
            disabled={pending}
          >
            CSV ?????
          </Button>
        </div>

        <div className="pfFocusRow" role="tablist" aria-label="????? ???? ???">
          {(
            [
              ["combined", "??????"],
              ["personal", "????"],
              ["group", "?????"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              className={scope === id ? "pfFocusChip isActive" : "pfFocusChip"}
              onClick={() => {
                setScope(id);
                startTransition(() => {
                  void (async () => {
                    try {
                      const ov = await api.personalFinanceOverview({
                        from,
                        to,
                        scope: id,
                      });
                      setOverview(ov);
                      setError(null);
                    } catch (err: unknown) {
                      setError(friendlyErrorMessage(err, "???????? ???? ??? ??????"));
                    }
                  })();
                });
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="pfFocusRow" role="tablist" aria-label="????? ?????">
          {(
            [
              ["paid", "?????? ??"],
              ["share", "??? ????"],
              ["net", "????? ????"],
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
          <EmptyHint>?? ??? ????????�</EmptyHint>
        ) : null}

        {overview ? (
          <>
            <div className="pfTotals">
              <div>
                <span className="pfTotalsLabel">??? ?????? ?? ????</span>
                <Amount irrMinor={overview.totals.paid.amountMinor} />
              </div>
              <div>
                <span className="pfTotalsLabel">??? ??? ???? ?? ????</span>
                <Amount irrMinor={overview.totals.share.amountMinor} />
              </div>
              {overview.totals.personalIncome ? (
                <div>
                  <span className="pfTotalsLabel">????? ????</span>
                  <Amount irrMinor={overview.totals.personalIncome.amountMinor} />
                </div>
              ) : null}
              {overview.totals.personalExpense ? (
                <div>
                  <span className="pfTotalsLabel">????? ????</span>
                  <Amount irrMinor={overview.totals.personalExpense.amountMinor} />
                </div>
              ) : null}
            </div>
            <StatusLine>
              {workspaceCount != null ? `${workspaceCount} ??? � ` : null}
              ????: ??? {overview.source.expense === "postgres" ? "Postgres" : "?????"} � ??????{" "}
              {overview.source.ledger === "postgres" ? "Postgres" : "?????"} �{" "}
              {formatFaDate(overview.from)} ?? {formatFaDate(overview.to)}
            </StatusLine>

            {overview.workspaces.length === 0 ? (
              <EmptyHint>???? ????? ????? ??????.</EmptyHint>
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
                            ? ` � ${line.expenseCount} ??? ?? ????`
                            : " � ???? ??? ?? ????"}
                          {focus !== "paid" ? (
                            <>
                              {" "}
                              � ?????? <Amount irrMinor={line.paid.amountMinor} />
                            </>
                          ) : null}
                          {focus !== "share" ? (
                            <>
                              {" "}
                              � ??? <Amount irrMinor={line.share.amountMinor} />
                            </>
                          ) : null}
                          {focus !== "net" ? (
                            <>
                              {" "}
                              � ????? <Amount irrMinor={line.net.amountMinor} />
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
            <StatusLine>??? ????? (??? ???? ????? API)</StatusLine>
            <div className="pfFocusRow" role="tablist" aria-label="????????? ????">
              {(
                [
                  ["day", "???"],
                  ["week", "????"],
                  ["month", "???"],
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
                          setError(friendlyErrorMessage(err, "???????? ???? ??????"));
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
              <EmptyHint>?? ??? ???? ??????? ????.</EmptyHint>
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
                        ??? <Amount irrMinor={b.share.amountMinor} /> � ????{" "}
                        <Amount irrMinor={b.personalExpense.amountMinor} />
                        {b.expenseCount > 0 ? ` � ${b.expenseCount} ???` : ""}
                      </small>
                    </li>
                  );
                })}
              </ul>
            )}
            <StatusLine>
              ??? ???? ?? ????:{" "}
              <Amount irrMinor={trends.totals.personalExpense.amountMinor} /> � ????{" "}
              {trends.source.expense === "postgres" ? "Postgres" : "?????"}/
              {trends.source.personal === "postgres" ? "Postgres" : "?????"}
            </StatusLine>
          </div>
        ) : null}
      </FormStack>
    </SectionCard>
  );
}
