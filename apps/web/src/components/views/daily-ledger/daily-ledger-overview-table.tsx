"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DailyLedgerResponse } from "@dang/contracts";
import {
  countDayItems,
  formatJalaliIso,
  sumDayFundDeposits,
  weekdayFaSatFirst,
} from "@dang/contracts";
import { Amount } from "@dang/ui";
import { EmptyHint, StatusPill } from "@/components/ui-blocks";
import { NAV_LABELS } from "@/lib/nav-labels";
import styles from "./daily-ledger-overview-table.module.css";

type DailyLedgerOverviewTableProps = {
  ledger: DailyLedgerResponse;
  todayIso: string;
  pending?: boolean;
  onOpenDay: (date: string) => void;
  onToggleHoliday?: (date: string, current: boolean) => void;
};

function revealInScroller(
  scroller: HTMLElement,
  target: HTMLElement,
  behavior: ScrollBehavior,
) {
  if (typeof scroller.scrollTo !== "function") return;
  const delta =
    target.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  const next =
    scroller.scrollTop + delta - (scroller.clientHeight - target.offsetHeight) / 2;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  try {
    scroller.scrollTo({ top: Math.min(max, Math.max(0, next)), behavior });
  } catch {
    /* jsdom has no layout scroll */
  }
}

function dayStatusLabel(row: DailyLedgerResponse["days"][number]): {
  text: string;
  tone: "ok" | "warn" | "gold";
} {
  if (row.isHoliday) return { text: "تعطیل", tone: "warn" };
  if (row.isRangeLocked) return { text: "قفل", tone: "gold" };
  return { text: "عادی", tone: "ok" };
}

/**
 * Range overview — table on desktop/tablet, card stack on phones.
 */
export function DailyLedgerOverviewTable({
  ledger,
  todayIso,
  pending = false,
  onOpenDay,
  onToggleHoliday,
}: DailyLedgerOverviewTableProps) {
  const [narrow, setNarrow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardScrollRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ above: false, below: false });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 640px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = narrow ? cardScrollRef.current : scrollRef.current;
    if (!el) return;
    const sync = () => {
      const above = el.scrollTop > 6;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 6;
      setEdges((prev) =>
        prev.above === above && prev.below === below ? prev : { above, below },
      );
    };
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro =
      typeof ResizeObserver === "function" ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro?.disconnect();
    };
  }, [narrow, ledger.from, ledger.to, ledger.days.length]);

  useEffect(() => {
    const scroller = narrow ? cardScrollRef.current : scrollRef.current;
    if (!scroller) return;
    const today = scroller.querySelector<HTMLElement>("[data-today='true']");
    const frame = requestAnimationFrame(() => {
      if (today) revealInScroller(scroller, today, "auto");
      else if (typeof scroller.scrollTo === "function") {
        try {
          scroller.scrollTo({ top: 0 });
        } catch {
          /* jsdom has no layout scroll */
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [narrow, ledger.from, ledger.to, todayIso]);

  function onRangeKeyDown(event: KeyboardEvent<HTMLElement>) {
    const scroller = narrow ? cardScrollRef.current : scrollRef.current;
    if (!scroller) return;
    if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      const delta = scroller.clientHeight * 0.85 * (event.key === "PageDown" ? 1 : -1);
      if (typeof scroller.scrollBy === "function") {
        scroller.scrollBy({ top: delta, behavior: "smooth" });
      }
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    const rows = [
      ...scroller.querySelectorAll<HTMLElement>(narrow ? "[data-day-card]" : "tbody tr"),
    ];
    if (rows.length === 0) return;
    const active = document.activeElement;
    const index = rows.findIndex((row) => row === active || row.contains(active));
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else if (event.key === "ArrowDown") next = Math.min(rows.length - 1, index < 0 ? 0 : index + 1);
    else next = Math.max(0, index < 0 ? rows.length - 1 : index - 1);
    const row = rows[next];
    if (!row || next === index) return;
    event.preventDefault();
    row.focus();
    revealInScroller(scroller, row, "smooth");
  }

  let depositRange = 0n;
  for (const row of ledger.days) {
    depositRange += BigInt(sumDayFundDeposits(row));
  }

  if (ledger.days.length === 0) {
    return (
      <div className={styles.root}>
        <EmptyHint>در این بازه روزی نیست — بازه را عوض کنید.</EmptyHint>
      </div>
    );
  }

  const footer = (
    <div className={styles.footer}>
      <span>جمع بازه ({ledger.days.length} روز)</span>
      <div className={styles.footerNums}>
        <span>
          خرج: <Amount irrMinor={ledger.totals.grand.amountMinor} />
        </span>
        <span>
          واریز:{" "}
          {depositRange === 0n ? (
            <span className={styles.muted}>—</span>
          ) : (
            <Amount irrMinor={depositRange.toString()} />
          )}
        </span>
      </div>
    </div>
  );

  return (
    <div className={styles.root}>
      <div
        ref={scrollRef}
        className={[
          styles.scroll,
          edges.above ? styles.moreAbove : "",
          edges.below ? styles.moreBelow : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="روزهای بازه"
        aria-hidden={narrow || undefined}
        inert={narrow ? true : undefined}
        onKeyDown={narrow ? undefined : onRangeKeyDown}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">روز</th>
              <th scope="col">وضعیت</th>
              <th scope="col" className={styles.num}>
                خرج روز
              </th>
              <th scope="col" className={`${styles.num} ${styles.hideSm}`}>
                واریز صندوق
              </th>
              <th scope="col" className={`${styles.num} ${styles.hideMd}`}>
                قلم‌ها
              </th>
              <th scope="col" className={styles.actions}>
                <span className={styles.srOnly}>اقدام</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ledger.days.map((row) => {
              const status = dayStatusLabel(row);
              const isToday = row.date === todayIso;
              const depositMinor = sumDayFundDeposits(row);
              const items = countDayItems(row);
              const noteHint = row.note?.trim();
              return (
                <tr
                  key={row.date}
                  data-today={isToday ? "true" : undefined}
                  className={[
                    styles.row,
                    isToday ? styles.today : "",
                    row.isHoliday ? styles.holiday : "",
                    row.isRangeLocked ? styles.locked : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  tabIndex={narrow ? -1 : 0}
                  aria-label={`${weekdayFaSatFirst(row.weekday)} ${formatJalaliIso(row.date)} — جزئیات`}
                  onClick={(e) => {
                    const el = e.target as HTMLElement;
                    if (el.closest("button")) return;
                    onOpenDay(row.date);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenDay(row.date);
                    }
                  }}
                >
                  <td>
                    <button
                      type="button"
                      className={styles.dayBtn}
                      onClick={() => onOpenDay(row.date)}
                      tabIndex={narrow ? -1 : undefined}
                    >
                      <span className={styles.weekday}>
                        {weekdayFaSatFirst(row.weekday)}
                      </span>
                      <span className={styles.jalali}>{formatJalaliIso(row.date)}</span>
                      {isToday ? <span className={styles.todayMark}>امروز</span> : null}
                    </button>
                    {noteHint ? (
                      <span className={styles.noteHint} title={noteHint}>
                        {noteHint.length > 36 ? `${noteHint.slice(0, 36)}…` : noteHint}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {onToggleHoliday && !row.isRangeLocked ? (
                      <button
                        type="button"
                        className={styles.statusBtn}
                        disabled={pending}
                        tabIndex={narrow ? -1 : undefined}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleHoliday(row.date, row.isHoliday);
                        }}
                        title="تغییر تعطیلی"
                      >
                        <StatusPill tone={status.tone}>{status.text}</StatusPill>
                      </button>
                    ) : (
                      <StatusPill tone={status.tone}>{status.text}</StatusPill>
                    )}
                  </td>
                  <td className={styles.num}>
                    <Amount irrMinor={row.dayTotal.amountMinor} />
                    {(row.relatedExpenses ?? []).length > 0 ? (
                      <span
                        className={styles.relatedMark}
                        title={`${(row.relatedExpenses ?? []).length} ${NAV_LABELS.fullExpense} همان روز`}
                      >
                        {" "}
                        · {(row.relatedExpenses ?? []).length.toLocaleString("fa-IR")}{" "}
                        {NAV_LABELS.fullExpense}
                      </span>
                    ) : null}
                  </td>
                  <td className={`${styles.num} ${styles.hideSm}`}>
                    {depositMinor === "0" ? (
                      <span className={styles.muted}>—</span>
                    ) : (
                      <Amount irrMinor={depositMinor} />
                    )}
                  </td>
                  <td className={`${styles.num} ${styles.hideMd}`}>
                    {items === 0 ? (
                      <span className={styles.muted}>—</span>
                    ) : (
                      new Intl.NumberFormat("fa-IR").format(items)
                    )}
                  </td>
                  <td className={styles.actions}>
                    <button
                      type="button"
                      className={styles.detailBtn}
                      tabIndex={narrow ? -1 : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDay(row.date);
                      }}
                    >
                      جزئیات
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={styles.dockFooter}>{footer}</div>

      <ul
        ref={cardScrollRef}
        className={[
          styles.cardList,
          edges.above ? styles.moreAbove : "",
          edges.below ? styles.moreBelow : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="خلاصه روزهای بازه"
        aria-hidden={!narrow || undefined}
        inert={!narrow ? true : undefined}
        onKeyDown={narrow ? onRangeKeyDown : undefined}
      >
        {ledger.days.map((row) => {
          const status = dayStatusLabel(row);
          const isToday = row.date === todayIso;
          const depositMinor = sumDayFundDeposits(row);
          const items = countDayItems(row);
          return (
            <li
              key={`card-${row.date}`}
              data-day-card=""
              data-today={isToday ? "true" : undefined}
              tabIndex={narrow ? 0 : -1}
              className={[
                styles.dayCard,
                isToday ? styles.today : "",
                row.isHoliday ? styles.holiday : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className={styles.dayCardMain}
                onClick={() => onOpenDay(row.date)}
                tabIndex={!narrow ? -1 : undefined}
              >
                <div className={styles.dayCardHead}>
                  <strong>
                    {weekdayFaSatFirst(row.weekday)} · {formatJalaliIso(row.date)}
                  </strong>
                  <StatusPill tone={status.tone}>{status.text}</StatusPill>
                </div>
                <div className={styles.dayCardMetrics}>
                  <span>
                    خرج{" "}
                    <b>
                      <Amount irrMinor={row.dayTotal.amountMinor} />
                    </b>
                  </span>
                  <span>
                    واریز{" "}
                    <b>
                      {depositMinor === "0" ? (
                        <span className={styles.muted}>—</span>
                      ) : (
                        <Amount irrMinor={depositMinor} />
                      )}
                    </b>
                  </span>
                  <span>
                    قلم{" "}
                    <b>
                      {items === 0
                        ? "—"
                        : new Intl.NumberFormat("fa-IR").format(items)}
                    </b>
                  </span>
                  {(row.relatedExpenses ?? []).length > 0 ? (
                    <span className={styles.relatedMark}>
                      {(row.relatedExpenses ?? []).length.toLocaleString("fa-IR")}{" "}
                      {NAV_LABELS.fullExpense}
                    </span>
                  ) : null}
                </div>
              </button>
              <div className={styles.dayCardActions}>
                {onToggleHoliday && !row.isRangeLocked ? (
                  <button
                    type="button"
                    className={styles.statusBtn}
                    disabled={pending}
                    tabIndex={!narrow ? -1 : undefined}
                    onClick={() => onToggleHoliday(row.date, row.isHoliday)}
                  >
                    {row.isHoliday ? "عادی" : "تعطیل"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.detailBtn}
                  tabIndex={!narrow ? -1 : undefined}
                  onClick={() => onOpenDay(row.date)}
                >
                  جزئیات
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className={styles.mobileFooter}>{footer}</div>
    </div>
  );
}
