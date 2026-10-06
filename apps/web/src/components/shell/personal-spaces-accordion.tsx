"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  currentJalaliYearMonth,
  jalaliYearMonthDateBounds,
  resolveYearMonthDateBounds,
  spaceKindForTemplate,
  type PersonalFinanceMetricFocus,
  type PersonalFinanceWorkspaceLine,
  type SpaceKind,
  type WorkspaceSummary,
} from "@dang/contracts";
import { Amount } from "@dang/ui";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";
import { assignKindGems, gemCssVars } from "@/lib/tile-gem-palettes";
import styles from "./personal-spaces-accordion.module.css";

const KIND_ORDER: SpaceKind[] = ["group", "building", "org", "personal"];

const KIND_TITLE: Record<SpaceKind, string> = {
  group: "دوستان و خانواده",
  building: "ساختمان‌ها",
  org: "سازمان و پروژه",
  personal: "دفتر شخصی",
};

const KIND_HINT: Record<SpaceKind, string> = {
  group: "گروه‌های دوستانه و خانوادگی",
  building: "شارژ، قبوض و واحدها",
  org: "تیم‌ها، شرکا و پروژه‌ها",
  personal: "خرج کاملاً شخصی",
};

type AccordionProps = {
  /** Jalali YYYY-MM when loading overview internally. */
  yearMonth?: string;
  /** Preloaded overview lines — skips internal fetch when set. */
  lines?: PersonalFinanceWorkspaceLine[];
  /** Persistence footnote when lines are preloaded. */
  sourceLabel?: string | null;
  focus?: PersonalFinanceMetricFocus;
  hidePersonal?: boolean;
  compact?: boolean;
  className?: string;
};

type KindBucket = {
  kind: SpaceKind;
  workspaces: WorkspaceSummary[];
  lines: PersonalFinanceWorkspaceLine[];
  shareMinor: bigint;
  paidMinor: bigint;
  netMinor: bigint;
  expenseCount: number;
};

function primaryMinor(
  line: PersonalFinanceWorkspaceLine | undefined,
  focus: PersonalFinanceMetricFocus,
): string {
  if (!line) return "0";
  if (focus === "share") return line.share.amountMinor;
  if (focus === "net") return line.net.amountMinor;
  return line.paid.amountMinor;
}

/**
 * Collapsible directory of groups / buildings / projects for personal surfaces.
 * Numbers from overview API (or preloaded lines) only — no decorative zeros.
 */
export function PersonalSpacesAccordion({
  yearMonth,
  lines: linesProp,
  sourceLabel: sourceProp,
  focus = "share",
  hidePersonal = true,
  compact = false,
  className,
}: AccordionProps) {
  const chrome = useAppChrome();
  const ym = yearMonth?.trim() || currentJalaliYearMonth();
  const controlled = linesProp !== undefined;
  const [fetchedLines, setFetchedLines] = useState<PersonalFinanceWorkspaceLine[]>(
    [],
  );
  const [fetchedSource, setFetchedSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(controlled);
  const [pending, startTransition] = useTransition();
  const [openKind, setOpenKind] = useState<SpaceKind | null>(null);

  useEffect(() => {
    if (controlled || !chrome.ready) return;
    startTransition(async () => {
      setError(null);
      try {
        const { from, to } = resolveYearMonthDateBounds(
          ym,
          jalaliYearMonthDateBounds,
        );
        const ov = await api.personalFinanceOverview({
          from,
          to,
          scope: "combined",
        });
        setFetchedLines(ov.workspaces);
        setFetchedSource(
          `خرج ${ov.source.expense === "postgres" ? "Postgres" : "حافظه"} · دفترکل ${
            ov.source.ledger === "postgres" ? "Postgres" : "حافظه"
          }`,
        );
      } catch (e) {
        setError(friendlyErrorMessage(e, "بارگذاری فضاها ناموفق بود"));
      } finally {
        setLoaded(true);
      }
    });
  }, [controlled, chrome.ready, ym]);

  useEffect(() => {
    if (controlled) setLoaded(true);
  }, [controlled, linesProp]);

  const lines = controlled ? (linesProp ?? []) : fetchedLines;
  const sourceLabel = controlled ? (sourceProp ?? null) : fetchedSource;

  const buckets = useMemo(() => {
    const byKind: Record<SpaceKind, KindBucket> = {
      personal: {
        kind: "personal",
        workspaces: [],
        lines: [],
        shareMinor: 0n,
        paidMinor: 0n,
        netMinor: 0n,
        expenseCount: 0,
      },
      group: {
        kind: "group",
        workspaces: [],
        lines: [],
        shareMinor: 0n,
        paidMinor: 0n,
        netMinor: 0n,
        expenseCount: 0,
      },
      building: {
        kind: "building",
        workspaces: [],
        lines: [],
        shareMinor: 0n,
        paidMinor: 0n,
        netMinor: 0n,
        expenseCount: 0,
      },
      org: {
        kind: "org",
        workspaces: [],
        lines: [],
        shareMinor: 0n,
        paidMinor: 0n,
        netMinor: 0n,
        expenseCount: 0,
      },
    };

    const lineById = new Map(lines.map((l) => [l.workspaceId, l]));

    for (const ws of chrome.workspaces) {
      const kind = spaceKindForTemplate(ws.template);
      const bucket = byKind[kind];
      bucket.workspaces.push(ws);
      const line = lineById.get(ws.id);
      if (line) {
        bucket.lines.push(line);
        bucket.shareMinor += BigInt(line.share.amountMinor);
        bucket.paidMinor += BigInt(line.paid.amountMinor);
        bucket.netMinor += BigInt(line.net.amountMinor);
        bucket.expenseCount += line.expenseCount;
      }
    }

    for (const kind of KIND_ORDER) {
      byKind[kind].workspaces.sort((a, b) =>
        a.name.localeCompare(b.name, "fa"),
      );
    }

    return KIND_ORDER.filter((k) => !(hidePersonal && k === "personal")).map(
      (k) => byKind[k],
    );
  }, [chrome.workspaces, lines, hidePersonal]);

  const totalSpaces = buckets.reduce((n, b) => n + b.workspaces.length, 0);

  return (
    <section
      className={`${styles.accordion}${className ? ` ${className}` : ""}`}
      aria-label="گروه‌ها و پروژه‌ها"
      aria-busy={pending && !loaded}
    >
      {!compact ? (
        <div className={styles.head}>
          <h2 className={styles.title}>گروه‌ها و پروژه‌ها</h2>
          <p className={styles.hint}>
            {totalSpaces > 0
              ? `${totalSpaces.toLocaleString("fa-IR")} فضا — برای جزئیات باز کنید`
              : "هنوز فضای گروهی ندارید"}
          </p>
        </div>
      ) : null}

      {!loaded && pending ? (
        <>
          <div className={styles.skeleton} aria-hidden />
          <div className={styles.skeleton} aria-hidden />
        </>
      ) : null}

      {error ? <p className="liveError">{error}</p> : null}

      {loaded
        ? buckets.map((bucket) => {
            const lead =
              focus === "share"
                ? bucket.shareMinor
                : focus === "net"
                  ? bucket.netMinor
                  : bucket.paidMinor;
            const isOpen = openKind === bucket.kind;
            const gemById = assignKindGems(
              bucket.kind,
              bucket.workspaces.map((ws) => ws.id),
            );
            return (
              <details
                key={bucket.kind}
                className={styles.group}
                data-kind={bucket.kind}
                open={isOpen}
                onToggle={(e) => {
                  const el = e.currentTarget;
                  if (el.open) setOpenKind(bucket.kind);
                  else if (openKind === bucket.kind) setOpenKind(null);
                }}
              >
                <summary className={styles.summary}>
                  <span className={styles.chevron} aria-hidden />
                  <div className={styles.summaryMain}>
                    <p className={styles.summaryTitle}>
                      {KIND_TITLE[bucket.kind]}
                    </p>
                    <p className={styles.summaryMeta}>
                      {KIND_HINT[bucket.kind]}
                      {bucket.expenseCount > 0
                        ? ` · ${bucket.expenseCount.toLocaleString("fa-IR")} خرج`
                        : ""}
                    </p>
                  </div>
                  <span className={styles.count}>
                    {bucket.workspaces.length.toLocaleString("fa-IR")}
                  </span>
                  <span className={styles.summaryAmount}>
                    {bucket.workspaces.length > 0 ? (
                      <Amount irrMinor={lead.toString()} />
                    ) : (
                      "—"
                    )}
                  </span>
                </summary>
                <div className={styles.body}>
                  {bucket.workspaces.length === 0 ? (
                    <p className={styles.empty}>
                      فضایی در این دسته نیست. از فهرست فضاها بسازید یا بپیوندید.
                    </p>
                  ) : (
                    bucket.workspaces.map((ws) => {
                      const line = bucket.lines.find(
                        (l) => l.workspaceId === ws.id,
                      );
                      const primary = primaryMinor(line, focus);
                      return (
                        <div key={ws.id} className={styles.rowShell}>
                          <Link
                            href={wPath(ws.slug, "space")}
                            className={styles.row}
                            style={gemCssVars(gemById.get(ws.id))}
                            onClick={() => chrome.selectWorkspace(ws.id)}
                          >
                            <div className={styles.rowMain}>
                              <span className={styles.rowName}>{ws.name}</span>
                              <span className={styles.rowMeta}>
                                <span>{workspaceTemplateLabel(ws.template)}</span>
                                {line && line.expenseCount > 0 ? (
                                  <span>
                                    {line.expenseCount.toLocaleString("fa-IR")} خرج
                                  </span>
                                ) : (
                                  <span>بدون خرج در بازه</span>
                                )}
                                {line && line.openSettlements > 0 ? (
                                  <span>
                                    {line.openSettlements.toLocaleString("fa-IR")}{" "}
                                    تسویه باز
                                  </span>
                                ) : null}
                                {ws.archivedAt ? (
                                  <span className={styles.archivedTag}>بایگانی</span>
                                ) : null}
                              </span>
                            </div>
                            <div className={styles.rowStats}>
                              <span className={styles.rowPrimary}>
                                <Amount irrMinor={primary} />
                              </span>
                              {line ? (
                                <span className={styles.rowSecondary}>
                                  {focus === "share" ? (
                                    <>
                                      پرداخت{" "}
                                      <Amount irrMinor={line.paid.amountMinor} />
                                    </>
                                  ) : (
                                    <>
                                      سهم{" "}
                                      <Amount irrMinor={line.share.amountMinor} />
                                    </>
                                  )}
                                </span>
                              ) : null}
                            </div>
                          </Link>
                          <div className={styles.rowActions}>
                            <Link
                              href={wPath(ws.slug, "space")}
                              className={styles.rowAction}
                              onClick={() => chrome.selectWorkspace(ws.id)}
                            >
                              ورود
                            </Link>
                            <Link
                              href={`${wPath(ws.slug, "settings")}#danger`}
                              className={styles.rowAction}
                              onClick={() => chrome.selectWorkspace(ws.id)}
                            >
                              تنظیمات
                            </Link>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </details>
            );
          })
        : null}

      {loaded && sourceLabel ? (
        <p className={styles.footer}>
          معیار:{" "}
          {focus === "share" ? "سهم مصرف" : focus === "net" ? "مانده" : "پرداخت"} ·{" "}
          {sourceLabel}
        </p>
      ) : null}
    </section>
  );
}
