"use client";

import { useMemo } from "react";
import type { DailyLedgerItem, DailyLedgerResponse } from "@dang/contracts";
import { formatJalaliIso, weekdayFaSatFirst } from "@dang/contracts";
import { Amount } from "@dang/ui";
import { StatusPill } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { DailyLedgerDepositStrip } from "@/components/views/daily-ledger/daily-ledger-deposit-strip";
import { DailyLedgerFundingBadge } from "@/components/views/daily-ledger/daily-ledger-funding-badge";
import type { DraftTarget } from "@/components/views/daily-ledger/daily-ledger-utils";

type DailyLedgerGridProps = {
  ledger: DailyLedgerResponse;
  viewMode: "table" | "cards";
  todayIso: string;
  pending: boolean;
  selectedDate?: string | null;
  /** Guest/auditor — hide add/edit/delete and day meta mutators. */
  readOnly?: boolean;
  fundNameById?: Record<string, string>;
  onSelectDay?: (date: string) => void;
  onOpenDraft: (target: DraftTarget, item?: DailyLedgerItem) => void;
  onOpenDeposit?: (date: string) => void;
  onDeleteItem: (expenseId: string) => void;
  onToggleHoliday: (date: string, current: boolean) => void;
  onEditNote: (date: string, note: string) => void;
};

type LocatableItem = {
  expenseId: string;
  item: DailyLedgerItem;
  target: DraftTarget;
};

function collectItems(ledger: DailyLedgerResponse): LocatableItem[] {
  const out: LocatableItem[] = [];
  for (const row of ledger.days) {
    if (row.isHoliday || row.isRangeLocked) continue;
    for (const m of ledger.members) {
      const cell = row.members[m.userId];
      for (const it of cell?.items ?? []) {
        out.push({
          expenseId: it.expenseId,
          item: it,
          target: {
            kind: "member",
            date: row.date,
            userId: m.userId,
            displayName: m.displayName,
            expenseId: it.expenseId,
          },
        });
      }
    }
    for (const it of row.shared.items) {
      out.push({
        expenseId: it.expenseId,
        item: it,
        target: {
          kind: "shared",
          date: row.date,
          expenseId: it.expenseId,
        },
      });
    }
  }
  return out;
}

function ItemBlock({
  item,
  readOnly,
  fundNameById,
  selected,
  onToggle,
}: {
  item: DailyLedgerItem;
  readOnly: boolean;
  fundNameById?: Record<string, string>;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`dlItem${!readOnly ? ` ${selStyles.selectableRow}` : ""}`}
      {...(!readOnly
        ? rowSelectActivateProps({ onActivate: onToggle })
        : {})}
    >
      <div className="dlItemMain">
        {!readOnly ? (
          <RowSelectCheckbox
            checked={selected}
            onChange={onToggle}
            label={`انتخاب ${item.title}`}
          />
        ) : null}
        <span className="dlItemTitle">{item.title}</span>
        <b className="dlItemAmt">
          <Amount irrMinor={item.amount.amountMinor} />
        </b>
      </div>
      <DailyLedgerFundingBadge item={item} fundNameById={fundNameById} />
    </div>
  );
}

/**
 * Day × member consumption grid (table + cards) for the daily ledger.
 * Extracted from daily-ledger-view.tsx — presentational, driven by parent handlers.
 */
export function DailyLedgerGrid({
  ledger,
  viewMode,
  todayIso,
  pending,
  selectedDate,
  readOnly = false,
  fundNameById,
  onSelectDay,
  onOpenDraft,
  onOpenDeposit,
  onDeleteItem,
  onToggleHoliday,
  onEditNote,
}: DailyLedgerGridProps) {
  const locatable = useMemo(() => collectItems(ledger), [ledger]);
  const selection = useRowSelection(locatable.map((l) => l.expenseId));
  const canMutate = !readOnly;

  function editSelected() {
    if (selection.selectedCount !== 1) return;
    const id = selection.selectedIds[0];
    const found = locatable.find((l) => l.expenseId === id);
    if (!found) return;
    onOpenDraft(found.target, found.item);
    selection.clear();
  }

  function deleteSelected() {
    if (selection.selectedCount === 0) return;
    const ids = selection.selectedIds;
    const label =
      ids.length === 1
        ? "این قلم حذف شود؟"
        : `${ids.length.toLocaleString("fa-IR")} قلم حذف شوند؟`;
    if (!window.confirm(label)) return;
    for (const id of ids) onDeleteItem(id);
    selection.clear();
  }

  return (
    <div className={viewMode === "cards" ? "dlCards" : "dlScroll"}>
      {canMutate && locatable.length > 0 ? (
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
      {viewMode === "cards" ? (
        <div className="dlCardList">
          {ledger.days.map((row) => (
            <article
              key={row.date}
              className={
                row.isHoliday
                  ? "dlDayCard dlHoliday"
                  : row.isRangeLocked
                    ? "dlDayCard dlLocked"
                    : "dlDayCard"
              }
            >
              <header>
                <div>
                  <b>{formatJalaliIso(row.date)}</b>
                </div>
                <span className={row.weekday === 6 ? "dlWeekdayStart" : undefined}>
                  {weekdayFaSatFirst(row.weekday)}
                </span>
                {onSelectDay ? (
                  <button
                    type="button"
                    className="dlItemBtn"
                    aria-pressed={selectedDate === row.date}
                    onClick={() => onSelectDay(row.date)}
                  >
                    جزئیات
                  </button>
                ) : null}
              </header>
              <DailyLedgerDepositStrip
                deposits={row.fundDeposits ?? []}
                members={ledger.members}
              />
              {row.isHoliday || row.isRangeLocked ? (
                <p className="dlMuted">
                  {row.isHoliday ? "تعطیل — ثبت قلم بسته است" : "قفل بازه — ثبت قلم بسته است"}
                </p>
              ) : (
                <>
                  {ledger.members.map((m) => {
                    const cell = row.members[m.userId];
                    return (
                      <div key={m.userId} className="dlCardBlock">
                        <strong>{m.displayName}</strong>
                        {cell?.items.map((it) => (
                          <ItemBlock
                            key={it.expenseId}
                            item={it}
                            readOnly={readOnly}
                            fundNameById={fundNameById}
                            selected={selection.isSelected(it.expenseId)}
                            onToggle={() => selection.toggle(it.expenseId)}
                          />
                        ))}
                        {!readOnly ? (
                          <button
                            type="button"
                            className="dlAdd"
                            onClick={() =>
                              onOpenDraft({
                                kind: "member",
                                date: row.date,
                                userId: m.userId,
                                displayName: m.displayName,
                              })
                            }
                          >
                            + کالا
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  <div className="dlCardBlock">
                    <strong>هزینه مشترک</strong>
                    {row.shared.items.map((it) => (
                      <ItemBlock
                        key={it.expenseId}
                        item={it}
                        readOnly={readOnly}
                        fundNameById={fundNameById}
                        selected={selection.isSelected(it.expenseId)}
                        onToggle={() => selection.toggle(it.expenseId)}
                      />
                    ))}
                    {!readOnly ? (
                      <button
                        type="button"
                        className="dlAdd"
                        onClick={() => onOpenDraft({ kind: "shared", date: row.date })}
                      >
                        + مشترک
                      </button>
                    ) : null}
                  </div>
                  {!readOnly && onOpenDeposit ? (
                    <button
                      type="button"
                      className="dlAdd dlDepositAdd"
                      onClick={() => onOpenDeposit(row.date)}
                    >
                      + واریز به صندوق
                    </button>
                  ) : null}
                  <footer>
                    جمع مصرف: <Amount irrMinor={row.dayTotal.amountMinor} />
                  </footer>
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <table className="dlTable">
          <thead>
            <tr>
              <th>ردیف</th>
              <th>روز</th>
              <th>تاریخ</th>
              {ledger.members.map((m) => (
                <th key={m.userId}>{m.displayName}</th>
              ))}
              <th>هزینه مشترک</th>
              <th>جمع روز</th>
              <th>توضیحات</th>
              <th>وضعیت</th>
              {onSelectDay ? <th>بازرس</th> : null}
            </tr>
          </thead>
          <tbody>
            {ledger.days.map((row, idx) => {
              const isSat = row.weekday === 6;
              const isToday = row.date === todayIso;
              return (
                <tr
                  key={row.date}
                  className={
                    row.isHoliday
                      ? "dlHoliday"
                      : row.isRangeLocked
                        ? "dlLocked"
                        : isToday
                          ? "dlToday"
                          : isSat
                            ? "dlSat"
                            : idx % 2
                              ? "dlAlt"
                              : undefined
                  }
                >
                  <td>{idx + 1}</td>
                  <td className="dlWeekday">
                    <span className={isSat ? "dlWeekdayStart" : undefined}>
                      {weekdayFaSatFirst(row.weekday)}
                    </span>
                    {isToday ? <small className="dlTodayBadge">امروز</small> : null}
                  </td>
                  <td className="dlDate">
                    <span className="dlJalali">{formatJalaliIso(row.date)}</span>
                    {row.isRangeLocked ? (
                      <small className="dlLockBadge">قفل</small>
                    ) : null}
                    <DailyLedgerDepositStrip
                      deposits={row.fundDeposits ?? []}
                      members={ledger.members}
                    />
                    {!readOnly &&
                    onOpenDeposit &&
                    !row.isHoliday &&
                    !row.isRangeLocked ? (
                      <button
                        type="button"
                        className="dlAdd dlDepositAdd"
                        onClick={() => onOpenDeposit(row.date)}
                      >
                        + واریز
                      </button>
                    ) : null}
                  </td>
                  {ledger.members.map((m) => {
                    const cell = row.members[m.userId];
                    return (
                      <td key={m.userId}>
                        {row.isHoliday || row.isRangeLocked ? (
                          <span className="dlMuted">
                            {row.isHoliday ? "تعطیل" : "قفل"}
                          </span>
                        ) : (
                          <div className="dlCell">
                            {cell?.items.map((it) => (
                              <ItemBlock
                                key={it.expenseId}
                                item={it}
                                readOnly={readOnly}
                                fundNameById={fundNameById}
                                selected={selection.isSelected(it.expenseId)}
                                onToggle={() => selection.toggle(it.expenseId)}
                              />
                            ))}
                            {!readOnly ? (
                              <button
                                type="button"
                                className="dlAdd"
                                onClick={() =>
                                  onOpenDraft({
                                    kind: "member",
                                    date: row.date,
                                    userId: m.userId,
                                    displayName: m.displayName,
                                  })
                                }
                              >
                                + کالا
                              </button>
                            ) : null}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    {row.isHoliday || row.isRangeLocked ? (
                      <span className="dlMuted">
                        {row.isHoliday ? "تعطیل" : "قفل"}
                      </span>
                    ) : (
                      <div className="dlCell">
                        {row.shared.items.map((it) => (
                          <ItemBlock
                            key={it.expenseId}
                            item={it}
                            readOnly={readOnly}
                            fundNameById={fundNameById}
                            selected={selection.isSelected(it.expenseId)}
                            onToggle={() => selection.toggle(it.expenseId)}
                          />
                        ))}
                        {!readOnly ? (
                          <button
                            type="button"
                            className="dlAdd"
                            onClick={() =>
                              onOpenDraft({
                                kind: "shared",
                                date: row.date,
                              })
                            }
                          >
                            + مشترک
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                  <td className="dlTotal">
                    {row.isHoliday ? (
                      "—"
                    ) : (
                      <Amount irrMinor={row.dayTotal.amountMinor} />
                    )}
                  </td>
                  <td>
                    {readOnly ? (
                      <span className="dlMuted">
                        {row.note?.trim() || (row.isHoliday ? "تعطیل" : "—")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="dlNoteBtn"
                        onClick={() => onEditNote(row.date, row.note ?? "")}
                      >
                        {row.note?.trim() || (row.isHoliday ? "تعطیل" : "…")}
                      </button>
                    )}
                  </td>
                  <td>
                    {readOnly ? (
                      row.isHoliday ? (
                        <StatusPill tone="warn">تعطیل</StatusPill>
                      ) : (
                        <span className="dlStatusNormal">عادی</span>
                      )
                    ) : (
                      <button
                        type="button"
                        className="dlHolidayBtn"
                        onClick={() => onToggleHoliday(row.date, row.isHoliday)}
                        disabled={pending}
                      >
                        {row.isHoliday ? (
                          <StatusPill tone="warn">تعطیل — کلیک برای عادی</StatusPill>
                        ) : (
                          <span className="dlStatusNormal">عادی — کلیک برای تعطیل</span>
                        )}
                      </button>
                    )}
                  </td>
                  {onSelectDay ? (
                    <td>
                      <button
                        type="button"
                        className="dlItemBtn"
                        aria-pressed={selectedDate === row.date}
                        onClick={() => onSelectDay(row.date)}
                      >
                        جزئیات
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>جمع بازه ({ledger.days.length} روز)</td>
              {ledger.members.map((m) => (
                <td key={m.userId}>
                  <Amount irrMinor={ledger.totals.members[m.userId]?.amountMinor ?? "0"} />
                </td>
              ))}
              <td>
                <Amount irrMinor={ledger.totals.shared.amountMinor} />
              </td>
              <td>
                <Amount irrMinor={ledger.totals.grand.amountMinor} />
              </td>
              <td colSpan={onSelectDay ? 3 : 2} />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
