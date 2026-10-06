"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import type {
  MemberStatementDetail,
  MemberStatementSummary,
  MembershipSummary,
  StatementLine,
} from "@dang/contracts";
import { inspectPayoutDestination, isFinanceManagerRole, sumStatementShareMinor } from "@dang/contracts";
import { Button, SelectField } from "@dang/ui";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  EmptyStateBlock,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import { ContentSkeleton } from "@/components/shell/content-skeleton";
import { JalaliDateField } from "@/components/jalali-date-field";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { MoneyAmount } from "@/components/money-amount";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { formatFaDate, formatFaDateTime } from "@/lib/fa-datetime";
import { useLiveInvalidation } from "@/lib/live-invalidation";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useFlashMessage, FlashMessages } from "@/lib/use-flash-message";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";
import { t } from "@/lib/i18n";
import styles from "./statements-view.module.css";
import { StatementsTour } from "@/components/views/statements-tour";

function maskDestination(kind: "card" | "iban", value: string): string {
  const digits = value.replace(/\s+/g, "");
  if (kind === "card" && digits.length >= 4) {
    return `${digits.slice(0, 4)} ···· ···· ${digits.slice(-4)}`;
  }
  if (kind === "iban" && digits.length >= 8) {
    return `${digits.slice(0, 4)} ··· ${digits.slice(-4)}`;
  }
  return digits;
}

function recognizedPayoutBank(payout: {
  destinationKind: "card" | "iban";
  destinationValue: string;
  bankName?: string;
}): string | null {
  if (payout.bankName) return payout.bankName;
  const seen = inspectPayoutDestination(payout.destinationKind, payout.destinationValue);
  return seen.checkOk ? (seen.bank?.nameFa ?? null) : null;
}

function rangeQuery(
  from: string,
  to: string,
  granularity: "day" | "period",
  catalogItemId?: string,
): string {
  const params = new URLSearchParams();
  params.set("from", from);
  params.set("to", to);
  if (granularity === "day") params.set("granularity", "day");
  if (catalogItemId) params.set("catalogItemId", catalogItemId);
  return params.toString();
}

function activePreset(
  from: string,
  to: string,
): "month" | "lastMonth" | "7d" | "30d" | null {
  const month = monthBounds();
  if (from === month.from && to === month.to) return "month";
  const last = lastMonthBounds();
  if (from === last.from && to === last.to) return "lastMonth";
  const d7 = lastNDaysBounds(7);
  if (from === d7.from && to === d7.to) return "7d";
  const d30 = lastNDaysBounds(30);
  if (from === d30.from && to === d30.to) return "30d";
  return null;
}

function railBalance(s: MemberStatementSummary): {
  amountMinor: string;
  labelKey: "statements.payable" | "statements.credit" | "statements.balanced";
  tone: "payable" | "credit" | "balanced";
} {
  if (s.payableMinor !== "0") {
    return { amountMinor: s.payableMinor, labelKey: "statements.payable", tone: "payable" };
  }
  if (s.creditMinor !== "0") {
    return { amountMinor: s.creditMinor, labelKey: "statements.credit", tone: "credit" };
  }
  return { amountMinor: "0", labelKey: "statements.balanced", tone: "balanced" };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthBounds(d = new Date()): { from: string; to: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0));
  return { from: isoDay(from), to: isoDay(to) };
}

function lastMonthBounds(d = new Date()): { from: string; to: string } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));
  return { from: isoDay(from), to: isoDay(to) };
}

function lastNDaysBounds(n: number, d = new Date()): { from: string; to: string } {
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (n - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

function issuedAtLabel(): string {
  return formatFaDateTime(new Date());
}

function groupLinesByDay(lines: readonly StatementLine[]): Array<{
  date: string;
  weekdayFa: string;
  lines: StatementLine[];
  dayShareMinor: string;
}> {
  const map = new Map<string, StatementLine[]>();
  for (const line of lines) {
    const bucket = map.get(line.date) ?? [];
    bucket.push(line);
    map.set(line.date, bucket);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, dayLines]) => {
      const share = dayLines.reduce((acc, l) => acc + BigInt(l.shareMinor), 0n);
      return {
        date,
        weekdayFa: dayLines[0]?.weekdayFa ?? "",
        lines: dayLines,
        dayShareMinor: share.toString(),
      };
    });
}

type Props = {
  focusUserId?: string;
  printMode?: boolean;
  initialFrom?: string;
  initialTo?: string;
  initialGranularity?: "day" | "period";
  initialCatalogItemId?: string;
};

export function StatementsView({
  focusUserId,
  printMode = false,
  initialFrom,
  initialTo,
  initialGranularity,
  initialCatalogItemId,
}: Props) {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const router = useRouter();
  const pathname = usePathname();
  const workspaceId = scope.workspaceId || chrome.workspaceId;
  const statementsProvider = chrome.capabilities?.providers?.statements;
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();

  const bounds = monthBounds();
  const [from, setFrom] = useState(initialFrom || bounds.from);
  const [to, setTo] = useState(initialTo || bounds.to);
  const [granularity, setGranularity] = useState<"day" | "period">(
    initialGranularity ?? "period",
  );
  const [catalogItemId, setCatalogItemId] = useState(initialCatalogItemId ?? "");
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [summaries, setSummaries] = useState<MemberStatementSummary[]>([]);
  const [detail, setDetail] = useState<MemberStatementDetail | null>(null);
  const [myRole, setMyRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [packExporting, setPackExporting] = useState<
    "xlsx" | "csv" | "html_print" | "pdf" | null
  >(null);
  const [packDocumentNo, setPackDocumentNo] = useState("");
  const [packDocTitle, setPackDocTitle] = useState("");
  const [packLetterhead, setPackLetterhead] = useState("");
  const [packFooter, setPackFooter] = useState("");
  const [packSeal, setPackSeal] = useState("");
  const [notifying, setNotifying] = useState(false);

  const preset = activePreset(from, to);
  const query = rangeQuery(from, to, granularity, catalogItemId || undefined);

  const slug =
    scope.slug ||
    chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.slug ||
    "";
  const actorId = chrome.actor?.userId ?? "";
  const finance = isFinanceManagerRole(myRole);
  const workspaceName = chrome.workspaceName || scope.slug || "—";

  async function refresh(wsId: string) {
    setLoading(true);
    setError(null);
    try {
      const memberList = await api.listMembers(wsId);
      setMembers(memberList);
      const me = memberList.find((m) => m.userId === actorId);
      setMyRole(me?.role ?? "");

      const list = await api.listStatements(wsId, { from, to, granularity });
      setSummaries(list.members);

      const target =
        focusUserId ||
        (isFinanceManagerRole(me?.role) ? list.members[0]?.userId : actorId) ||
        actorId;
      if (target) {
        const d = await api.getMemberStatement(wsId, target, { from, to });
        setDetail(d);
      } else {
        setDetail(null);
      }
    } catch (reason: unknown) {
      setError(friendlyErrorMessage(reason, t("statements.loadError")));
      setDetail(null);
      setSummaries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!chrome.ready || !workspaceId || statementsProvider !== "csv_json_print_v1") {
      setLoading(false);
      return;
    }
    void refresh(workspaceId);
  }, [chrome.ready, workspaceId, from, to, granularity, focusUserId, statementsProvider]);

  // A statement is computed from the journal on every read, so any posting or
  // settlement elsewhere makes what is on screen out of date immediately.
  useLiveInvalidation(["statements", "balances", "expenses", "settlements"], () => {
    if (!chrome.ready || !workspaceId || statementsProvider !== "csv_json_print_v1") return;
    if (printMode) return;
    void refresh(workspaceId);
  });

  useEffect(() => {
    if (printMode || !pathname) return;
    const next = `${pathname}?${query}`;
    const current =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}`
        : "";
    if (current === next) return;
    router.replace(next, { scroll: false });
  }, [from, to, granularity, catalogItemId, pathname, printMode, query, router]);

  useEffect(() => {
    if (!printMode || loading || !detail) return;
    const timer = window.setTimeout(() => {
      window.print();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [printMode, loading, detail]);

  function applyPreset(kind: "month" | "lastMonth" | "7d" | "30d") {
    const next =
      kind === "month"
        ? monthBounds()
        : kind === "lastMonth"
          ? lastMonthBounds()
          : kind === "7d"
            ? lastNDaysBounds(7)
            : lastNDaysBounds(30);
    setFrom(next.from);
    setTo(next.to);
  }

  function onExport(format: "csv" | "json") {
    if (!workspaceId || !detail) return;
    if (catalogFilterActive) {
      flashSuccess(t("statements.exportUnfilteredHint"));
    }
    setExporting(format);
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createStatementExport(workspaceId, detail.userId, {
            from,
            to,
            format,
          });
          const { blob, fileName } = await api.downloadStatementExportBlob(
            workspaceId,
            created.id,
            format,
          );
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = fileName;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
          flashSuccess(t("statements.exportReady"));
        } catch (reason: unknown) {
          setError(friendlyErrorMessage(reason, t("statements.exportError")));
        } finally {
          setExporting(null);
        }
      })();
    });
  }

  const packPdfLive =
    chrome.capabilities?.providers?.statementPackPdf === "pdfkit_vazir_v1";

  function onPackExport(format: "xlsx" | "csv" | "html_print" | "pdf") {
    if (!workspaceId) return;
    if (format === "pdf" && !packPdfLive) {
      setError(t("statements.packPdfUnavailable"));
      return;
    }
    setPackExporting(format);
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createStatementPackExport(workspaceId, {
            from,
            to,
            format,
            documentNo: packDocumentNo.trim() || undefined,
            kindDocumentTitle: packDocTitle.trim() || undefined,
            letterheadNote: packLetterhead.trim() || undefined,
            footerNote: packFooter.trim() || undefined,
            sealLabel: packSeal.trim() || undefined,
          });
          const { blob, fileName } = await api.downloadStatementExportBlob(
            workspaceId,
            created.id,
            format === "html_print"
              ? "html"
              : format === "xlsx"
                ? "xlsx"
                : format === "pdf"
                  ? "pdf"
                  : "csv",
          );
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = fileName;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          if (format === "html_print") {
            window.open(url, "_blank", "noopener,noreferrer");
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            flashSuccess(t("statements.packHtmlReady"));
          } else {
            URL.revokeObjectURL(url);
            flashSuccess(
              format === "pdf"
                ? t("statements.packPdfReady")
                : t("statements.packExportReady"),
            );
          }
        } catch (reason: unknown) {
          setError(friendlyErrorMessage(reason, t("statements.packExportError")));
        } finally {
          setPackExporting(null);
        }
      })();
    });
  }

  function onNotify() {
    if (!workspaceId || !detail || !finance) return;
    setNotifying(true);
    startTransition(() => {
      void (async () => {
        try {
          const res = await api.notifyStatementReady(workspaceId, detail.userId, {
            from,
            to,
          });
          flashSuccess(
            res.emailDelivered
              ? t("statements.notifySent")
              : t("statements.notifyInAppOnly"),
          );
        } catch (reason: unknown) {
          setError(friendlyErrorMessage(reason, t("statements.notifyError")));
        } finally {
          setNotifying(false);
        }
      })();
    });
  }

  function onCopyDestination() {
    const value = detail?.payoutInstructions?.destinationValue;
    if (!value) return;
    void navigator.clipboard.writeText(value).then(
      () => flashSuccess(t("statements.copied")),
      () => setError(t("statements.copyFailed")),
    );
  }

  const memberName = (userId: string) =>
    members.find((m) => m.userId === userId)?.displayName ?? userId.slice(0, 8);

  const catalogOptions = useMemo(() => {
    if (!detail?.lines.length) return [] as Array<{ id: string; label: string }>;
    const map = new Map<string, string>();
    for (const line of detail.lines) {
      const id = line.catalogItemId?.trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, line.itemName || id.slice(0, 8));
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fa"));
  }, [detail]);

  const filteredLines = useMemo(() => {
    if (!detail?.lines.length) return [] as StatementLine[];
    if (!catalogItemId) return detail.lines;
    return detail.lines.filter((line) => line.catalogItemId === catalogItemId);
  }, [detail, catalogItemId]);

  const filteredShareMinor = useMemo(
    () => sumStatementShareMinor(filteredLines).toString(),
    [filteredLines],
  );
  const catalogFilterActive = Boolean(catalogItemId);

  const dayGroups = useMemo(
    () => (filteredLines.length ? groupLinesByDay(filteredLines) : []),
    [filteredLines],
  );

  const payableActive =
    !catalogFilterActive &&
    detail != null &&
    BigInt(detail.payableMinor || "0") > 0n;
  const creditActive =
    !catalogFilterActive &&
    detail != null &&
    BigInt(detail.creditMinor || "0") > 0n;

  if (statementsProvider !== "csv_json_print_v1") {
    if (printMode) {
      return <p className={styles.printRoot}>{t("statements.capabilityOff")}</p>;
    }
    return (
      <AppShell
        workspaceId={chrome.workspaceId}
        workspaceName={chrome.workspaceName || undefined}
        userName={chrome.userName || undefined}
        persistenceLabel={chrome.persistenceLabel}
      >
        <EmptyHint>{t("statements.capabilityOffHint")}</EmptyHint>
      </AppShell>
    );
  }

  function renderBillDocument(opts: { compactActions?: boolean }) {
    if (loading) {
      return <ContentSkeleton rows={5} label={t("statements.loadingDetail")} />;
    }
    if (!detail || detail.lines.length === 0) {
      return (
        <EmptyStateBlock
          title={t("statements.emptyTitle")}
          description={t("statements.emptyDescription")}
          sticker="ledger"
          action={
            slug ? (
              <Link href={wPath(slug, "expenses")}>
                <Button type="button">{t("statements.emptyCtaExpense")}</Button>
              </Link>
            ) : undefined
          }
        />
      );
    }

    return (
      <article className={styles.bill} aria-label={t("statements.billTitle")}>
        <header className={styles.billHeader}>
          <div className={styles.billBrand}>
            <p className={styles.billEyebrow}>{t("statements.billTitle")}</p>
            <h2 className={styles.billSubject}>{memberName(detail.userId)}</h2>
            <p className={styles.billMeta}>
              <span className={styles.billWorkspace}>{workspaceName}</span>
              <span className={styles.billDot} aria-hidden="true" />
              <span>
                {formatFaDate(from)} — {formatFaDate(to)}
              </span>
              {catalogFilterActive ? (
                <>
                  <span className={styles.billDot} aria-hidden="true" />
                  <span>{t("statements.catalogFilterActive")}</span>
                </>
              ) : null}
            </p>
          </div>
          <div className={styles.billIssued}>
            <span>{t("statements.issuedAt")}</span>
            <strong>{issuedAtLabel()}</strong>
            {catalogFilterActive ? (
              <span className={styles.sealOk}>{t("statements.catalogFilterShareOnly")}</span>
            ) : detail.zeroSumOk ? (
              <span className={styles.sealOk}>{t("statements.zeroSumOk")}</span>
            ) : (
              <span className={styles.sealBad}>{t("statements.zeroSumBad")}</span>
            )}
          </div>
        </header>

        <div className={styles.summaryStrip} role="group" aria-label={t("statements.payable")}>
          <div className={styles.summaryCell}>
            <span>
              {catalogFilterActive
                ? t("statements.totalShareFiltered")
                : t("statements.totalShare")}
            </span>
            <strong className={styles.amountLg}>
              <MoneyAmount
                irrMinor={
                  catalogFilterActive ? filteredShareMinor : detail.totalShareMinor
                }
              />
            </strong>
          </div>
          {catalogFilterActive ? (
            <div className={styles.summaryCell}>
              <span>{t("statements.totalShare")}</span>
              <strong className={styles.amountLg}>
                <MoneyAmount irrMinor={detail.totalShareMinor} />
              </strong>
            </div>
          ) : (
            <div className={styles.summaryCell}>
              <span>{t("statements.totalPaid")}</span>
              <strong className={styles.amountLg}>
                <MoneyAmount irrMinor={detail.totalPaidMinor} />
              </strong>
            </div>
          )}
          <div
            className={`${styles.summaryCell} ${payableActive ? styles.summaryPayable : creditActive ? styles.summaryCredit : styles.summaryBalanced}`}
          >
            <span>
              {catalogFilterActive
                ? t("statements.catalogFilterLines")
                : payableActive
                  ? t("statements.payable")
                  : creditActive
                    ? t("statements.credit")
                    : t("statements.balanced")}
            </span>
            <strong className={styles.amountHero}>
              {catalogFilterActive ? (
                <span>{filteredLines.length}</span>
              ) : (
                <MoneyAmount
                  irrMinor={
                    payableActive
                      ? detail.payableMinor
                      : creditActive
                        ? detail.creditMinor
                        : "0"
                  }
                />
              )}
            </strong>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.tableCaption}>
              {t("statements.billTitle")} · {memberName(detail.userId)} · {formatFaDate(from)} — {formatFaDate(to)}
              {catalogFilterActive ? ` · ${t("statements.catalogFilterActive")}` : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("statements.colRow")}</th>
                <th scope="col">{t("statements.colWeekday")}</th>
                <th scope="col">{t("statements.colDate")}</th>
                <th scope="col">{t("statements.colItem")}</th>
                <th scope="col" className={styles.num}>
                  {t("statements.colQty")}
                </th>
                <th scope="col">{t("statements.colUnit")}</th>
                <th scope="col" className={styles.num}>
                  {t("statements.colUnitPrice")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("statements.colLineTotal")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("statements.colRatio")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("statements.colShare")}
                </th>
                <th scope="col">{t("statements.colMethod")}</th>
              </tr>
            </thead>
            <tbody>
              {catalogItemId && filteredLines.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyHint>{t("statements.catalogFilterEmpty")}</EmptyHint>
                  </td>
                </tr>
              ) : null}
              {dayGroups.map((group) => {
                const prior = dayGroups
                  .filter((g) => g.date < group.date)
                  .reduce((n, g) => n + g.lines.length, 0);
                return (
                  <Fragment key={`day-${group.date}`}>
                    <tr className={styles.dayBand}>
                      <th scope="rowgroup" colSpan={11}>
                        <span className={styles.dayBandLabel}>
                          {group.weekdayFa} · {formatFaDate(group.date)}
                        </span>
                        <span className={styles.dayBandShare}>
                          {t("statements.colShare")}:{" "}
                          <MoneyAmount irrMinor={group.dayShareMinor} />
                        </span>
                      </th>
                    </tr>
                    {group.lines.map((line, idx) => (
                      <tr key={`${line.expenseId}-${idx}`}>
                        <td className={styles.num}>{prior + idx + 1}</td>
                        <td>{line.weekdayFa}</td>
                        <td className={styles.dateCell}>{formatFaDate(line.date)}</td>
                        <td>
                          <span className={styles.itemName}>{line.itemName}</span>
                          {line.catalogItemId ? (
                            <span className={styles.meta}> · {t("statements.catalog")}</span>
                          ) : null}
                          {line.fundingNoteFa ? (
                            <div className={styles.meta}>{line.fundingNoteFa}</div>
                          ) : null}
                        </td>
                        <td className={styles.num}>{line.quantity ?? "—"}</td>
                        <td>{line.unitCode ?? "—"}</td>
                        <td className={styles.num}>
                          {line.unitPriceMinor ? (
                            <MoneyAmount irrMinor={line.unitPriceMinor} />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={styles.num}>
                          <MoneyAmount irrMinor={line.totalMinor} />
                        </td>
                        <td className={styles.num}>{line.shareRatio}</td>
                        <td className={`${styles.num} ${styles.shareCell}`}>
                          <MoneyAmount irrMinor={line.shareMinor} />
                        </td>
                        <td>
                          <span className={styles.methodPill}>{line.splitMethod}</span>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className={styles.billFooter}>
          <div className={styles.footerBlock} data-emphasis="totals">
            <h3 className={styles.payoutTitle}>{t("statements.reconcileTitle")}</h3>
            {catalogFilterActive ? (
              <p className={styles.balanceHint}>{t("statements.catalogFilterReconcileHint")}</p>
            ) : null}
            <div className={styles.footerRow}>
              <span>
                {catalogFilterActive
                  ? t("statements.totalShareFiltered")
                  : t("statements.totalShare")}
              </span>
              <MoneyAmount
                irrMinor={
                  catalogFilterActive ? filteredShareMinor : detail.totalShareMinor
                }
              />
            </div>
            {!catalogFilterActive ? (
              <>
            <div className={styles.footerRow}>
              <span>{t("statements.totalPaid")}</span>
              <MoneyAmount irrMinor={detail.totalPaidMinor} />
            </div>
            {payableActive ? (
              <div className={`${styles.footerRow} ${styles.footerHighlight}`}>
                <span>{t("statements.payable")}</span>
                <MoneyAmount irrMinor={detail.payableMinor} />
              </div>
            ) : null}
            {creditActive ? (
              <div className={`${styles.footerRow} ${styles.footerCredit}`}>
                <span>{t("statements.credit")}</span>
                <MoneyAmount irrMinor={detail.creditMinor} />
              </div>
            ) : null}
            {!payableActive && !creditActive ? (
              <div className={styles.footerRow}>
                <span>{t("statements.balanced")}</span>
                <MoneyAmount irrMinor="0" />
              </div>
            ) : null}
            <p className={styles.balanceHint}>{t("statements.balanceHint")}</p>
            {!printMode && slug && payableActive ? (
              <p className={styles.balanceHint} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
                <Link
                  className="textButton"
                  href={`${wPath(slug, "payments")}?amountMinor=${encodeURIComponent(detail.payableMinor)}`}
                >
                  {t("statements.payShareCta")}
                </Link>
                <Link
                  className="textButton"
                  href={`${wPath(slug, "settlements")}#settlement-panel`}
                >
                  {t("statements.matchShareSettleCta")}
                </Link>
              </p>
            ) : null}
              </>
            ) : (
              <div className={styles.footerRow}>
                <span>{t("statements.totalShare")}</span>
                <MoneyAmount irrMinor={detail.totalShareMinor} />
              </div>
            )}
          </div>

          <div className={styles.footerBlock} data-emphasis="payout">
            <h3 className={styles.payoutTitle}>{t("statements.payoutTitle")}</h3>
            {detail.payoutInstructions ? (
              <dl className={styles.payoutGrid}>
                <div>
                  <dt>{t("statements.payoutHolder")}</dt>
                  <dd>{detail.payoutInstructions.holderName}</dd>
                </div>
                <div>
                  <dt>
                    {detail.payoutInstructions.destinationKind === "iban"
                      ? t("statements.payoutIban")
                      : t("statements.payoutCard")}
                  </dt>
                  <dd className={styles.destination}>
                    {printMode
                      ? detail.payoutInstructions.destinationValue
                      : maskDestination(
                          detail.payoutInstructions.destinationKind,
                          detail.payoutInstructions.destinationValue,
                        )}
                  </dd>
                </div>
                {recognizedPayoutBank(detail.payoutInstructions) ? (
                  <div>
                    <dt>{t("statements.payoutBank")}</dt>
                    <dd>{recognizedPayoutBank(detail.payoutInstructions)}</dd>
                  </div>
                ) : null}
                {!printMode ? (
                  <div className={styles.payoutActions}>
                    <Button type="button" variant="secondary" onClick={onCopyDestination}>
                      {t("statements.copyDestination")}
                    </Button>
                  </div>
                ) : null}
              </dl>
            ) : (
              <div className={styles.payoutUnset}>
                <EmptyHint>{t("statements.payoutUnset")}</EmptyHint>
                {slug && !printMode ? (
                  <Link className={styles.settingsLink} href={`${wPath(slug, "settings")}#payout`}>
                    {t("statements.payoutOpenSettings")}
                  </Link>
                ) : null}
              </div>
            )}
            {!payableActive && detail.payoutInstructions ? (
              <StatusLine>{t("statements.payoutIfDebt")}</StatusLine>
            ) : null}
          </div>
        </footer>

        {opts.compactActions ? (
          <div className={styles.actionsBar}>
            <Button
              type="button"
              disabled={pending || exporting !== null}
              onClick={() => onExport("csv")}
            >
              {exporting === "csv" ? "…" : t("statements.downloadCsv")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || exporting !== null}
              onClick={() => onExport("json")}
            >
              {exporting === "json" ? "…" : t("statements.downloadJson")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || packExporting !== null}
              onClick={() => onPackExport("xlsx")}
            >
              {packExporting === "xlsx" ? "…" : t("statements.downloadPackXlsx")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || packExporting !== null || !packPdfLive}
              title={!packPdfLive ? t("statements.packPdfUnavailable") : undefined}
              onClick={() => onPackExport("pdf")}
            >
              {packExporting === "pdf" ? "…" : t("statements.downloadPackPdf")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending || packExporting !== null}
              onClick={() => onPackExport("html_print")}
            >
              {packExporting === "html_print" ? "…" : t("statements.downloadPackPrint")}
            </Button>
            {slug ? (
              <Link
                className={styles.printLink}
                href={`/w/${encodeURIComponent(slug)}/statements/${detail.userId}/print?${query}`}
                target="_blank"
              >
                {t("statements.printPdf")}
              </Link>
            ) : null}
            {finance ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending || notifying}
                onClick={onNotify}
              >
                {notifying ? "…" : t("statements.notifyMember")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>
    );
  }

  if (printMode) {
    return (
      <div className={styles.printRoot}>
        {renderBillDocument({ compactActions: false })}
        <p className={styles.printHint}>{t("statements.printAutoHint")}</p>
      </div>
    );
  }

  const screenBody = (
    <WorkspacePageFrame
      title={NAV_LABELS.statements}
      description={t("statements.description")}
      primaryAction={
        slug && detail?.userId ? (
          <Link
            className={styles.primaryPrint}
            href={`/w/${encodeURIComponent(slug)}/statements/${detail.userId}/print?${query}`}
            target="_blank"
          >
            {t("statements.printPdf")}
          </Link>
        ) : slug ? (
          <Link href={wPath(slug, "payments")}>{NAV_LABELS.payments}</Link>
        ) : (
          <Link href="/home">{NAV_LABELS.spacesList}</Link>
        )
      }
      state="ready"
    >
      <FlashMessages successMessage={successMessage} error={error} />

      <section className={styles.toolbar} aria-label={t("statements.rangeTitle")}>
        <div className={styles.presets} role="group" aria-label={t("statements.rangeTitle")}>
          <button
            type="button"
            className={`${styles.preset} ${preset === "month" ? styles.presetActive : ""}`}
            aria-pressed={preset === "month"}
            onClick={() => applyPreset("month")}
          >
            {t("statements.presetMonth")}
          </button>
          <button
            type="button"
            className={`${styles.preset} ${preset === "lastMonth" ? styles.presetActive : ""}`}
            aria-pressed={preset === "lastMonth"}
            onClick={() => applyPreset("lastMonth")}
          >
            {t("statements.presetLastMonth")}
          </button>
          <button
            type="button"
            className={`${styles.preset} ${preset === "7d" ? styles.presetActive : ""}`}
            aria-pressed={preset === "7d"}
            onClick={() => applyPreset("7d")}
          >
            {t("statements.preset7d")}
          </button>
          <button
            type="button"
            className={`${styles.preset} ${preset === "30d" ? styles.presetActive : ""}`}
            aria-pressed={preset === "30d"}
            onClick={() => applyPreset("30d")}
          >
            {t("statements.preset30d")}
          </button>
        </div>
        <div className={styles.rangeFields}>
          <JalaliDateField
            label={t("statements.from")}
            value={from}
            onChange={setFrom}
          />
          <JalaliDateField
            label={t("statements.to")}
            value={to}
            onChange={setTo}
          />
          <SelectField
            label={t("statements.granularity")}
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as "day" | "period")}
          >
            <option value="period">{t("statements.granularityPeriod")}</option>
            <option value="day">{t("statements.granularityDay")}</option>
          </SelectField>
          {catalogOptions.length > 0 ? (
            <SelectField
              label={t("statements.catalogFilter")}
              value={catalogItemId}
              onChange={(event) => setCatalogItemId(event.target.value)}
            >
              <option value="">{t("statements.catalogFilterAll")}</option>
              {catalogOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </SelectField>
          ) : null}
          {finance && !focusUserId ? (
            <SelectField
              label={t("statements.member")}
              value={detail?.userId ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                if (!id || !slug) return;
                router.push(`/w/${encodeURIComponent(slug)}/statements/${id}?${query}`);
              }}
            >
              {summaries.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {memberName(s.userId)}
                </option>
              ))}
            </SelectField>
          ) : null}
        </div>
      </section>

      {!printMode ? (
        <section className={styles.actionsBar} aria-label={t("statements.actionsTitle")}>
          <details className={styles.packLetterhead} style={{ width: "100%", marginBottom: 8 }}>
            <summary>{t("statements.packLetterheadTitle")}</summary>
            <div
              style={{
                display: "grid",
                gap: 8,
                marginTop: 8,
                gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
              }}
            >
              <label style={{ display: "grid", gap: 4 }}>
                <span>{t("statements.packDocumentNo")}</span>
                <input
                  value={packDocumentNo}
                  onChange={(e) => setPackDocumentNo(e.target.value)}
                  placeholder="STP-…"
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span>{t("statements.packDocTitle")}</span>
                <input
                  value={packDocTitle}
                  onChange={(e) => setPackDocTitle(e.target.value)}
                  placeholder="صورتحساب …"
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span>{t("statements.packLetterhead")}</span>
                <input
                  value={packLetterhead}
                  onChange={(e) => setPackLetterhead(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span>{t("statements.packFooter")}</span>
                <input
                  value={packFooter}
                  onChange={(e) => setPackFooter(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                <span>{t("statements.packSeal")}</span>
                <input value={packSeal} onChange={(e) => setPackSeal(e.target.value)} />
              </label>
            </div>
          </details>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || packExporting !== null}
            onClick={() => onPackExport("xlsx")}
          >
            {packExporting === "xlsx" ? "…" : t("statements.downloadPackXlsx")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || packExporting !== null || !packPdfLive}
            title={!packPdfLive ? t("statements.packPdfUnavailable") : undefined}
            onClick={() => onPackExport("pdf")}
          >
            {packExporting === "pdf" ? "…" : t("statements.downloadPackPdf")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending || packExporting !== null}
            onClick={() => onPackExport("html_print")}
          >
            {packExporting === "html_print" ? "…" : t("statements.downloadPackPrint")}
          </Button>
        </section>
      ) : null}

      {finance && !focusUserId && summaries.length > 0 ? (
        <section
          className={styles.memberRail}
          aria-label={t("statements.membersSummary")}
          tabIndex={0}
        >
          {summaries.map((s) => {
            const active = detail?.userId === s.userId;
            const balance = railBalance(s);
            const href = slug
              ? `/w/${encodeURIComponent(slug)}/statements/${s.userId}?${query}`
              : "#";
            return (
              <Link
                key={s.userId}
                href={href}
                className={`${styles.memberCard} ${active ? styles.memberCardActive : ""} ${styles[`memberCard_${balance.tone}`]}`}
              >
                <span className={styles.memberCardName}>{memberName(s.userId)}</span>
                <span className={styles.memberCardMeta}>
                  {s.lineCount} {t("statements.metricLines")}
                  {granularity === "day" && s.days?.length
                    ? ` · ${s.days.length} ${t("statements.dayBuckets")}`
                    : null}
                </span>
                <span className={styles.memberCardAmount}>
                  <MoneyAmount irrMinor={balance.amountMinor} />
                </span>
                <span className={styles.memberCardLabel}>{t(balance.labelKey)}</span>
                {granularity === "day" && s.days && s.days.length > 0 ? (
                  <ul className={styles.dayTicks}>
                    {s.days.slice(0, 5).map((day) => (
                      <li key={day.date}>
                        <span>{formatFaDate(day.date)}</span>
                        <MoneyAmount irrMinor={day.shareMinor} showUnit={false} />
                      </li>
                    ))}
                    {s.days.length > 5 ? (
                      <li className={styles.dayTicksMore}>+{s.days.length - 5}</li>
                    ) : null}
                  </ul>
                ) : null}
              </Link>
            );
          })}
        </section>
      ) : null}

      {!printMode ? <StatementsTour /> : null}
      <SectionCard title={t("statements.billTitle")} description={`${formatFaDate(from)} — ${formatFaDate(to)}`}>
        {renderBillDocument({ compactActions: true })}
      </SectionCard>
    </WorkspacePageFrame>
  );

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      {screenBody}
    </AppShell>
  );
}
