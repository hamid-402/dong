"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type {
  DailyLedgerDayRow,
  DailyLedgerItem,
  DailyLedgerMemberColumn,
  DailyLedgerResponse,
} from "@dang/contracts";
import {
  flattenDailyLedgerDay,
  formatJalaliIso,
  sumDayFundDeposits,
  weekdayFaSatFirst,
} from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { EmptyHint, StatusLine, StatusPill } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import { DailyLedgerDepositStrip } from "@/components/views/daily-ledger/daily-ledger-deposit-strip";
import { DailyLedgerFundingBadge } from "@/components/views/daily-ledger/daily-ledger-funding-badge";
import { DailyLedgerSharePanel } from "@/components/views/daily-ledger/daily-ledger-share-panel";
import { DailyTickPanel } from "@/components/views/daily-ledger/daily-tick-panel";
import type { DraftTarget } from "@/components/views/daily-ledger/daily-ledger-utils";
import {
  formatLedgerQuantity,
  preferIndividualMemberUserId,
} from "@/components/views/daily-ledger/daily-ledger-utils";
import { NAV_LABELS } from "@/lib/nav-labels";
import { expenseStatusLabel } from "@/lib/status-labels";
import styles from "./daily-ledger-day-view.module.css";
import selStyles from "@/components/selection/selection-action-bar.module.css";

type DayNeighborMeta = {
  date: string;
  weekday: number;
} | null;

type DailyLedgerDayViewProps = {
  workspaceId: string;
  ledger: DailyLedgerResponse;
  day: DailyLedgerDayRow;
  members: readonly DailyLedgerMemberColumn[];
  fundNameById?: Record<string, string>;
  catalogEnabled: boolean;
  readOnly?: boolean;
  pending?: boolean;
  canDeposit?: boolean;
  rangeLabel?: string;
  preferMemberUserId?: string | null;
  lastMemberUserId?: string | null;
  prevDay?: DayNeighborMeta;
  nextDay?: DayNeighborMeta;
  /** @deprecated use prevDay */
  prevDate?: string | null;
  /** @deprecated use nextDay */
  nextDate?: string | null;
  onBack: () => void;
  onGoDate?: (date: string) => void;
  onOpenDraft: (target: DraftTarget, item?: DailyLedgerItem) => void;
  onOpenDeposit?: () => void;
  onDeleteItem: (expenseId: string, options?: { skipConfirm?: boolean }) => void;
  onEditNote: () => void;
  onToggleHoliday: () => void;
  onPosted: () => void;
  onError: (message: string) => void;
  /** Base expenses page for read-only cross-links (`?expense=`). */
  expensesHref?: string | null;
};

function dayStatusMeta(day: DailyLedgerDayRow): {
  text: string;
  tone: "ok" | "warn" | "gold";
} {
  if (day.isHoliday) return { text: "تعطیل", tone: "warn" };
  if (day.isRangeLocked) return { text: "قفل بازه", tone: "gold" };
  return { text: "عادی", tone: "ok" };
}

function neighborLabel(meta: DayNeighborMeta, fallback: string): string {
  if (!meta) return fallback;
  return `${weekdayFaSatFirst(meta.weekday)} ${formatJalaliIso(meta.date)}`;
}

function lineToItem(
  line: ReturnType<typeof flattenDailyLedgerDay>[number],
): DailyLedgerItem {
  return {
    expenseId: line.expenseId,
    title: line.title,
    amount: line.amount,
    visibility: line.column === "shared" ? "company" : "shared",
    status: line.status,
    fundingSourceKind: line.fundingSourceKind,
    fundingRefId: line.fundingRefId,
    catalogItemId: line.catalogItemId,
    unitCode: line.unitCode,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
  };
}

function lineDraftTarget(
  line: ReturnType<typeof flattenDailyLedgerDay>[number],
  date: string,
): DraftTarget {
  if (line.column === "member" && line.memberUserId) {
    return {
      kind: "member",
      date,
      userId: line.memberUserId,
      displayName: line.memberDisplayName ?? "",
      expenseId: line.expenseId,
    };
  }
  return { kind: "shared", date, expenseId: line.expenseId };
}

/**
 * Compact day workspace: sticky command bar + main lines + side rail
 * (members / deposits / optional tick) so related actions stay in one viewport.
 */
export function DailyLedgerDayView({
  workspaceId,
  ledger,
  day,
  members,
  fundNameById,
  catalogEnabled,
  readOnly = false,
  pending = false,
  canDeposit = false,
  rangeLabel,
  preferMemberUserId = null,
  lastMemberUserId = null,
  prevDay = null,
  nextDay = null,
  prevDate = null,
  nextDate = null,
  onBack,
  onGoDate,
  onOpenDraft,
  onOpenDeposit,
  onDeleteItem,
  onEditNote,
  onToggleHoliday,
  onPosted,
  onError,
  expensesHref = null,
}: DailyLedgerDayViewProps) {
  const lines = flattenDailyLedgerDay(day, members);
  const lineIds = lines.map((l) => l.expenseId);
  const selection = useRowSelection(lineIds);
  const depositMinor = sumDayFundDeposits(day);
  const closed = day.isHoliday || day.isRangeLocked;
  const status = dayStatusMeta(day);
  const showTick = !readOnly && !closed && catalogEnabled;
  const resolvedPrev: DayNeighborMeta =
    prevDay ?? (prevDate ? { date: prevDate, weekday: day.weekday } : null);
  const resolvedNext: DayNeighborMeta =
    nextDay ?? (nextDate ? { date: nextDate, weekday: day.weekday } : null);
  const [memberMenuOpen, setMemberMenuOpen] = useState(false);
  const memberMenuRef = useRef<HTMLDivElement>(null);
  const memberMenuId = useId();
  const [narrow, setNarrow] = useState(false);

  const canMutateRows = !readOnly && !closed;

  function editSelected() {
    if (selection.selectedCount !== 1) return;
    const id = selection.selectedIds[0];
    const line = lines.find((l) => l.expenseId === id);
    if (!line) return;
    onOpenDraft(lineDraftTarget(line, day.date), lineToItem(line));
    selection.clear();
  }

  function deleteSelected() {
    if (selection.selectedCount === 0) return;
    const ids = selection.selectedIds;
    const label =
      ids.length === 1
        ? "این قلم ابطال شود؟"
        : `${ids.length.toLocaleString("fa-IR")} قلم ابطال شوند؟`;
    if (!window.confirm(label)) return;
    for (const id of ids) onDeleteItem(id, { skipConfirm: true });
    selection.clear();
  }

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector(".dlOverlay")) return;
      if (!onGoDate) return;
      if (e.key === "ArrowRight" && resolvedPrev) {
        e.preventDefault();
        onGoDate(resolvedPrev.date);
      } else if (e.key === "ArrowLeft" && resolvedNext) {
        e.preventDefault();
        onGoDate(resolvedNext.date);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onGoDate, resolvedPrev, resolvedNext]);

  useEffect(() => {
    if (!memberMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!memberMenuRef.current?.contains(e.target as Node)) {
        setMemberMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMemberMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [memberMenuOpen]);

  function openIndividualFor(member: DailyLedgerMemberColumn) {
    setMemberMenuOpen(false);
    onOpenDraft({
      kind: "member",
      date: day.date,
      userId: member.userId,
      displayName: member.displayName,
    });
  }

  function onIndividualClick() {
    if (members.length === 0) return;
    if (members.length === 1) {
      openIndividualFor(members[0]!);
      return;
    }
    setMemberMenuOpen((v) => !v);
  }

  const preferredId = preferIndividualMemberUserId(members, {
    preferUserId: preferMemberUserId,
    lastUserId: lastMemberUserId,
  });
  const orderedMembers = [...members].sort((a, b) => {
    if (a.userId === preferredId) return -1;
    if (b.userId === preferredId) return 1;
    return 0;
  });

  return (
    <div className={styles.root} aria-label={`جزئیات ${formatJalaliIso(day.date)}`}>
      <header className={styles.stickyBar}>
        <nav className={styles.crumb} aria-label="مسیر دفتر">
          <button type="button" className={styles.crumbLink} onClick={onBack}>
            دفتر
          </button>
          <span className={styles.crumbSep} aria-hidden>
            ‹
          </span>
          <button type="button" className={styles.crumbLink} onClick={onBack}>
            {rangeLabel?.trim() || "خلاصه بازه"}
          </button>
          <span className={styles.crumbSep} aria-hidden>
            ‹
          </span>
          <span className={styles.crumbCurrent}>
            {weekdayFaSatFirst(day.weekday)} {formatJalaliIso(day.date)}
          </span>
        </nav>

        <div className={styles.barTop}>
          <button
            type="button"
            className={styles.back}
            onClick={onBack}
            aria-label="بازگشت به خلاصه بازه"
          >
            بازگشت به خلاصه بازه
          </button>
          <div className={styles.titleBlock}>
            <h2 className={styles.title}>
              {weekdayFaSatFirst(day.weekday)} · {formatJalaliIso(day.date)}
            </h2>
            <StatusPill tone={status.tone}>{status.text}</StatusPill>
          </div>
          <div className={styles.daySwitch} role="group" aria-label="جابه‌جایی روز">
            <button
              type="button"
              className={styles.navBtn}
              disabled={!resolvedPrev}
              onClick={() => resolvedPrev && onGoDate?.(resolvedPrev.date)}
              aria-label={
                resolvedPrev
                  ? `روز قبل: ${neighborLabel(resolvedPrev, "قبل")}`
                  : "روز قبل در بازه نیست"
              }
            >
              {resolvedPrev ? neighborLabel(resolvedPrev, "قبل") : "قبل"}
            </button>
            <button
              type="button"
              className={styles.navBtn}
              disabled={!resolvedNext}
              onClick={() => resolvedNext && onGoDate?.(resolvedNext.date)}
              aria-label={
                resolvedNext
                  ? `روز بعد: ${neighborLabel(resolvedNext, "بعد")}`
                  : "روز بعد در بازه نیست"
              }
            >
              {resolvedNext ? neighborLabel(resolvedNext, "بعد") : "بعد"}
            </button>
          </div>
        </div>

        <div className={styles.barMetrics}>
          <div className={styles.metric}>
            <span>خرج</span>
            <b>
              <Amount irrMinor={day.dayTotal.amountMinor} />
            </b>
          </div>
          <div className={styles.metric}>
            <span>واریز</span>
            <b>
              {depositMinor === "0" ? (
                <span className={styles.muted}>—</span>
              ) : (
                <Amount irrMinor={depositMinor} />
              )}
            </b>
          </div>
          <div className={styles.metric}>
            <span>قلم</span>
            <b>{new Intl.NumberFormat("fa-IR").format(lines.length)}</b>
          </div>
        </div>

        {!readOnly ? (
          <div className={styles.barActions}>
            {!closed ? (
              <>
                <Button
                  type="button"
                  onClick={() => onOpenDraft({ kind: "shared", date: day.date })}
                  disabled={pending}
                >
                  + مشترک
                </Button>
                {members.length > 0 ? (
                  <div className={styles.memberMenuWrap} ref={memberMenuRef}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onIndividualClick}
                      disabled={pending}
                      aria-haspopup="menu"
                      aria-expanded={memberMenuOpen}
                      aria-controls={memberMenuOpen ? memberMenuId : undefined}
                    >
                      + فردی
                    </Button>
                    {memberMenuOpen ? (
                      <ul
                        id={memberMenuId}
                        className={styles.memberMenu}
                        role="menu"
                        aria-label="انتخاب عضو برای قلم فردی"
                      >
                        {orderedMembers.map((m) => (
                          <li key={m.userId} role="none">
                            <button
                              type="button"
                              role="menuitem"
                              className={styles.memberMenuItem}
                              onClick={() => openIndividualFor(m)}
                            >
                              {m.displayName}
                              {m.userId === preferMemberUserId ? (
                                <span className={styles.memberHint}>خودم</span>
                              ) : null}
                              {m.userId === lastMemberUserId &&
                              m.userId !== preferMemberUserId ? (
                                <span className={styles.memberHint}>آخرین</span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                {canDeposit && onOpenDeposit ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onOpenDeposit}
                    disabled={pending}
                  >
                    + واریز
                  </Button>
                ) : null}
              </>
            ) : null}
            <button
              type="button"
              className={styles.quietLink}
              onClick={onEditNote}
              disabled={pending}
            >
              یادداشت
            </button>
            <button
              type="button"
              className={styles.quietLink}
              onClick={onToggleHoliday}
              disabled={pending || day.isRangeLocked}
            >
              {day.isHoliday ? "عادی کردن" : "تعطیل"}
            </button>
          </div>
        ) : null}

        {day.note?.trim() ? <p className={styles.note}>{day.note.trim()}</p> : null}
        {closed ? (
          <StatusLine>
            {day.isHoliday
              ? "تعطیل — ثبت بسته است."
              : "قفل بازه — ثبت بسته است."}
          </StatusLine>
        ) : null}
      </header>

      <div className={styles.workspace}>
        <main className={styles.main}>
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>اقلام مصرف</h3>
            {canMutateRows && lines.length > 0 ? (
              <span className={styles.panelHint}>تیک بزن → نوار انتخاب</span>
            ) : null}
          </div>
          {lines.length === 0 ? (
            <div className={styles.emptyBlock}>
              <EmptyHint>
                {(day.relatedExpenses ?? []).length > 0
                  ? `هنوز تیک ${NAV_LABELS.dailyEntry} نیست — ${NAV_LABELS.fullExpense} همین روز را در نوار کناری ببینید.`
                  : "قلمی نیست."}
                {!readOnly && !closed
                  ? " از «+ مشترک» / «+ فردی» یا ثبت سریع استفاده کنید."
                  : null}
              </EmptyHint>
              {!readOnly && !closed ? (
                <div className={styles.emptyActions}>
                  <Button
                    type="button"
                    onClick={() => onOpenDraft({ kind: "shared", date: day.date })}
                    disabled={pending}
                  >
                    + مشترک
                  </Button>
                  {members.length > 0 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onIndividualClick}
                      disabled={pending}
                    >
                      + فردی
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              {canMutateRows ? (
                <SelectionActionBar
                  selectedCount={selection.selectedCount}
                  onClear={selection.clear}
                >
                  <button
                    type="button"
                    disabled={selection.selectedCount !== 1 || pending}
                    onClick={editSelected}
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    className={selStyles.danger}
                    disabled={selection.selectedCount === 0 || pending}
                    onClick={deleteSelected}
                  >
                    حذف
                  </button>
                </SelectionActionBar>
              ) : null}
              <div
                className={styles.tableWrap}
                aria-hidden={narrow || undefined}
                inert={narrow ? true : undefined}
              >
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {canMutateRows ? (
                        <th scope="col" className={styles.selectCol}>
                          <RowSelectCheckbox
                            checked={selection.allSelected}
                            indeterminate={selection.someSelected}
                            onChange={selection.toggleAll}
                            label="انتخاب همه اقلام"
                          />
                        </th>
                      ) : null}
                      <th scope="col">نام</th>
                      <th scope="col" className={styles.num}>
                        تعداد
                      </th>
                      <th scope="col" className={styles.num}>
                        مبلغ
                      </th>
                      <th scope="col">ستون</th>
                      <th scope="col">منبع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const item = lineToItem(line);
                      const columnLabel =
                        line.column === "shared"
                          ? "مشترک"
                          : line.memberDisplayName ?? "عضو";
                      const qty = formatLedgerQuantity(
                        line.quantity,
                        line.unitCode,
                      );
                      return (
                        <tr
                          key={line.expenseId}
                          className={[
                            canMutateRows ? selStyles.selectableRow : "",
                            selection.isSelected(line.expenseId)
                              ? styles.rowSelected
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ") || undefined}
                          {...(canMutateRows
                            ? rowSelectActivateProps({
                                onActivate: () =>
                                  selection.toggle(line.expenseId),
                              })
                            : {})}
                        >
                          {canMutateRows ? (
                            <td className={styles.selectCol}>
                              <RowSelectCheckbox
                                checked={selection.isSelected(line.expenseId)}
                                onChange={() => selection.toggle(line.expenseId)}
                                label={`انتخاب ${line.title}`}
                              />
                            </td>
                          ) : null}
                          <td className={styles.titleCell}>{line.title}</td>
                          <td className={styles.num}>
                            <span className={styles.qtyCell}>
                              {qty.qty}
                              {qty.unit ? (
                                <span className={styles.muted}> {qty.unit}</span>
                              ) : null}
                            </span>
                          </td>
                          <td className={styles.num}>
                            <Amount irrMinor={line.amount.amountMinor} />
                          </td>
                          <td>{columnLabel}</td>
                          <td>
                            <DailyLedgerFundingBadge
                              item={item}
                              fundNameById={fundNameById}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul
                className={styles.cardList}
                aria-label="اقلام مصرف"
                aria-hidden={!narrow || undefined}
                inert={!narrow ? true : undefined}
              >
                {lines.map((line) => {
                  const item = lineToItem(line);
                  const columnLabel =
                    line.column === "shared"
                      ? "مشترک"
                      : line.memberDisplayName ?? "عضو";
                  const qty = formatLedgerQuantity(line.quantity, line.unitCode);
                  return (
                    <li
                      key={`card-${line.expenseId}`}
                      className={[
                        styles.lineCard,
                        canMutateRows ? selStyles.selectableRow : "",
                        selection.isSelected(line.expenseId)
                          ? styles.rowSelected
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      {...(canMutateRows
                        ? rowSelectActivateProps({
                            onActivate: () => selection.toggle(line.expenseId),
                          })
                        : {})}
                    >
                      <div className={styles.lineCardTop}>
                        {canMutateRows ? (
                          <RowSelectCheckbox
                            checked={selection.isSelected(line.expenseId)}
                            onChange={() => selection.toggle(line.expenseId)}
                            label={`انتخاب ${line.title}`}
                          />
                        ) : null}
                        <p className={styles.lineCardTitle}>{line.title}</p>
                        <span className={styles.lineCardAmount}>
                          <Amount irrMinor={line.amount.amountMinor} />
                        </span>
                      </div>
                      <div className={styles.lineCardMeta}>
                        <span>{columnLabel}</span>
                        <span>
                          تعداد {qty.qty}
                          {qty.unit ? ` ${qty.unit}` : ""}
                        </span>
                        <DailyLedgerFundingBadge
                          item={item}
                          fundNameById={fundNameById}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {showTick ? (
            <details className={styles.tickFold}>
              <summary aria-label="باز و بسته کردن ثبت سریع تیک روزانه">
                ثبت سریع تیک روزانه — از کاتالوگ، چند قلم را سریع بزنید
              </summary>
              <DailyTickPanel
                workspaceId={workspaceId}
                date={day.date}
                members={ledger.members}
                catalogEnabled={catalogEnabled}
                readOnly={readOnly}
                pending={pending}
                compact
                onPosted={onPosted}
                onError={onError}
              />
            </details>
          ) : null}
        </main>

        <aside className={styles.rail} aria-label="خلاصه و واریز روز">
          {members.length > 0 ? (
            <div className={styles.railBlock}>
              <DailyLedgerSharePanel
                day={day}
                members={members}
                preferUserId={preferMemberUserId}
              />
            </div>
          ) : null}

          <section className={styles.railBlock}>
            <div className={styles.panelHead}>
              <h3 className={styles.panelTitle}>واریز صندوق</h3>
              {!readOnly && canDeposit && onOpenDeposit && !closed ? (
                <button type="button" className={styles.linkBtn} onClick={onOpenDeposit}>
                  +
                </button>
              ) : null}
            </div>
            {(day.fundDeposits ?? []).length ? (
              <DailyLedgerDepositStrip deposits={day.fundDeposits} members={members} />
            ) : (
              <p className={styles.railEmpty}>واریزی نیست</p>
            )}
          </section>

          {(day.relatedExpenses ?? []).length > 0 ? (
            <section className={styles.railBlock} aria-label={NAV_LABELS.fullExpense}>
              <div className={styles.panelHead}>
                <h3 className={styles.panelTitle}>{NAV_LABELS.fullExpense} همان روز</h3>
              </div>
              <p className={styles.railEmpty}>
                فقط مشاهده — ویرایش از مسیر {NAV_LABELS.expenses}.
              </p>
              <ul className={styles.relatedList}>
                {(day.relatedExpenses ?? []).map((exp) => {
                  const href = expensesHref
                    ? `${expensesHref}?expense=${encodeURIComponent(exp.id)}`
                    : null;
                  const body = (
                    <>
                      <span className={styles.relatedTitle}>{exp.title}</span>
                      <span className={styles.relatedMeta}>
                        <StatusPill tone={exp.status === "posted" ? "ok" : "warn"}>
                          {expenseStatusLabel(exp.status)}
                        </StatusPill>
                        <Amount irrMinor={exp.amount.amountMinor} />
                      </span>
                    </>
                  );
                  return (
                    <li key={exp.id}>
                      {href ? (
                        <Link className={styles.relatedLink} href={href}>
                          {body}
                        </Link>
                      ) : (
                        <div className={styles.relatedLink}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
