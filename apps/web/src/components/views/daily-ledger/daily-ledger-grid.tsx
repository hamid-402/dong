"use client";

import type { DailyLedgerItem, DailyLedgerResponse } from "@dang/contracts";
import { formatJalaliIso, weekdayFaSatFirst } from "@dang/contracts";
import { Amount } from "@dang/ui";
import { StatusPill } from "@/components/ui-blocks";
import {
  formatTomanMinor,
  type DraftTarget,
} from "@/components/views/daily-ledger/daily-ledger-utils";

type DailyLedgerGridProps = {
  ledger: DailyLedgerResponse;
  viewMode: "table" | "cards";
  showGregorian: boolean;
  todayIso: string;
  pending: boolean;
  selectedDate?: string | null;
  /** Guest/auditor — hide add/edit/delete and day meta mutators. */
  readOnly?: boolean;
  onSelectDay?: (date: string) => void;
  onOpenDraft: (target: DraftTarget, item?: DailyLedgerItem) => void;
  onDeleteItem: (expenseId: string) => void;
  onToggleHoliday: (date: string, current: boolean) => void;
  onEditNote: (date: string, note: string) => void;
};

function ItemActions({
  readOnly,
  onEdit,
  onDelete,
}: {
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (readOnly) return null;
  return (
    <div className="dlItemActions">
      <button type="button" className="dlItemBtn" onClick={onEdit}>
        ویرایش
      </button>
      <button type="button" className="dlItemBtn isDanger" onClick={onDelete}>
        حذف
      </button>
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
  showGregorian,
  todayIso,
  pending,
  selectedDate,
  readOnly = false,
  onSelectDay,
  onOpenDraft,
  onDeleteItem,
  onToggleHoliday,
  onEditNote,
}: DailyLedgerGridProps) {
  return (
    <div className={viewMode === "cards" ? "dlCards" : "dlScroll"}>
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
                  {showGregorian ? (
                    <small className="dlGregorian">{row.date}</small>
                  ) : null}
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
                          <div key={it.expenseId} className="dlItem">
                            <div className="dlItemMain">
                              <span className="dlItemTitle">{it.title}</span>
                              <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                            </div>
                            <ItemActions
                              readOnly={readOnly}
                              onEdit={() =>
                                onOpenDraft(
                                  {
                                    kind: "member",
                                    date: row.date,
                                    userId: m.userId,
                                    displayName: m.displayName,
                                    expenseId: it.expenseId,
                                  },
                                  it,
                                )
                              }
                              onDelete={() => onDeleteItem(it.expenseId)}
                            />
                          </div>
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
                      <div key={it.expenseId} className="dlItem">
                        <div className="dlItemMain">
                          <span className="dlItemTitle">{it.title}</span>
                          <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                        </div>
                        <ItemActions
                          readOnly={readOnly}
                          onEdit={() =>
                            onOpenDraft(
                              {
                                kind: "shared",
                                date: row.date,
                                expenseId: it.expenseId,
                              },
                              it,
                            )
                          }
                          onDelete={() => onDeleteItem(it.expenseId)}
                        />
                      </div>
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
                  <footer>
                    جمع: <Amount irrMinor={row.dayTotal.amountMinor} />
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
                    {showGregorian ? (
                      <small className="dlGregorian">{row.date}</small>
                    ) : null}
                    {row.isRangeLocked ? (
                      <small className="dlLockBadge">قفل</small>
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
                              <div key={it.expenseId} className="dlItem">
                                <div className="dlItemMain">
                                  <span className="dlItemTitle">{it.title}</span>
                                  <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                                </div>
                                <ItemActions
                                  readOnly={readOnly}
                                  onEdit={() =>
                                    onOpenDraft(
                                      {
                                        kind: "member",
                                        date: row.date,
                                        userId: m.userId,
                                        displayName: m.displayName,
                                        expenseId: it.expenseId,
                                      },
                                      it,
                                    )
                                  }
                                  onDelete={() => onDeleteItem(it.expenseId)}
                                />
                              </div>
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
                          <div key={it.expenseId} className="dlItem">
                            <div className="dlItemMain">
                              <span className="dlItemTitle">{it.title}</span>
                              <b className="dlItemAmt">{formatTomanMinor(it.amount.amountMinor)}</b>
                            </div>
                            <ItemActions
                              readOnly={readOnly}
                              onEdit={() =>
                                onOpenDraft(
                                  {
                                    kind: "shared",
                                    date: row.date,
                                    expenseId: it.expenseId,
                                  },
                                  it,
                                )
                              }
                              onDelete={() => onDeleteItem(it.expenseId)}
                            />
                          </div>
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
