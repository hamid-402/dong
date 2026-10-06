"use client";

import type { PettyCashLedgerResponse, PettyCashLedgerRow } from "@dang/contracts";
import { Amount, displayUnitLabel } from "@dang/ui";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { useDisplayUnit } from "@/lib/display-unit";
import { formatFaDateTime } from "@/lib/fa-datetime";
import styles from "./petty-cash-ledger-table.module.css";

function kindLabel(kind: PettyCashLedgerRow["kind"]): string {
  if (kind === "gift") return "هدیه به صندوق";
  if (kind === "topup") return "واریز / شارژ";
  if (kind === "spend") return "برداشت";
  if (kind === "return") return "بازگشت به صندوق";
  return "تعدیل";
}

function kindClass(kind: PettyCashLedgerRow["kind"]): string {
  if (kind === "topup" || kind === "return" || kind === "gift") return styles.in ?? "";
  if (kind === "spend") return styles.out ?? "";
  return styles.adj ?? "";
}

/**
 * Professional petty-cash journal — dates, in/out, actor, cash-in person,
 * and per-member contribution shares on topups (API-backed ledger only).
 */
export function PettyCashLedgerTable({
  ledger,
  fundLabel,
}: {
  ledger: PettyCashLedgerResponse | null;
  fundLabel?: string;
}) {
  const unitLabel = displayUnitLabel(useDisplayUnit());
  if (!ledger) {
    return <EmptyHint>دفتر تنخواه هنوز بارگذاری نشده.</EmptyHint>;
  }

  const newestFirst = [...ledger.rows].reverse();

  return (
    <div className={styles.wrap} id="petty-cash-ledger">
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>دفتر معین {fundLabel ?? ledger.fundName}</p>
          <h3 className={styles.title}>
            {ledger.fundName}
            {!ledger.fundActive ? (
              <span className={styles.closedBadge}> بسته</span>
            ) : null}
          </h3>
          <p className={styles.meta}>
            {ledger.fundActive ? "وضعیت: فعال" : "وضعیت: بسته (فقط مشاهده دفتر)"}
            {" · "}
            ایجاد: {formatFaDateTime(ledger.fundCreatedAt)}
            {ledger.createdByDisplayName
              ? ` · توسط ${ledger.createdByDisplayName}`
              : ""}
            {" · "}
            نگهبان: {ledger.custodianDisplayName}
            {" · "}
            مانده اول{" "}
            <Amount irrMinor={ledger.openingBalanceMinor} />
            {" · "}
            مانده الان{" "}
            <Amount irrMinor={ledger.closingBalanceMinor} />
          </p>
        </div>
        <StatusLine>
          {ledger.rows.length.toLocaleString("fa-IR")} حرکت ثبت‌شده
        </StatusLine>
      </header>

      {newestFirst.length === 0 ? (
        <EmptyHint>
          هنوز واریز یا برداشتی نیست — از فرم بالا شارژ یا برداشت ثبت کنید.
        </EmptyHint>
      ) : (
        <div className={styles.tableWrap} role="region" aria-label="جدول حرکات تنخواه">
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">تاریخ</th>
                <th scope="col">نوع</th>
                <th scope="col">شرح</th>
                <th scope="col">ثبت‌کننده</th>
                <th scope="col">واریزکننده به صندوق</th>
                <th scope="col">سهم اعضا</th>
                <th scope="col">مبلغ</th>
                <th scope="col">مانده بعد</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((row) => {
                const delta = BigInt(row.signedDeltaMinor);
                const positive = delta >= 0n;
                return (
                  <tr key={row.id}>
                    <td className={styles.date}>
                      <time dateTime={row.occurredAt}>
                        {formatFaDateTime(row.occurredAt)}
                      </time>
                    </td>
                    <td>
                      <span className={`${styles.kind} ${kindClass(row.kind)}`}>
                        {kindLabel(row.kind)}
                      </span>
                    </td>
                    <td className={styles.note}>
                      {row.note?.trim() || "—"}
                      {row.expenseId ? (
                        <span className={styles.expRef}>
                          {" "}
                          · خرج {row.expenseId.slice(0, 8)}
                        </span>
                      ) : null}
                    </td>
                    <td>{row.actorDisplayName}</td>
                    <td>
                      {row.cashInByDisplayName?.trim() ||
                        (row.kind === "topup" || row.kind === "gift"
                          ? row.actorDisplayName
                          : "—")}
                    </td>
                    <td className={styles.contribs}>
                      {row.memberContributions &&
                      row.memberContributions.length > 0 ? (
                        <ul>
                          {row.memberContributions.map((c) => (
                            <li key={c.userId}>
                              <span>{c.displayName}</span>
                              <Amount irrMinor={c.amountMinor} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={`${styles.amount} ${
                        positive ? styles.inAmt : styles.outAmt
                      }`}
                    >
                      {positive ? "+" : "−"}
                      <Amount
                        irrMinor={(delta < 0n ? -delta : delta).toString()}
                        showUnit={false}
                      />
                      <span className={styles.unit}>{unitLabel}</span>
                    </td>
                    <td className={styles.balance}>
                      <Amount irrMinor={row.balanceAfterMinor} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
