"use client";

import { useEffect, useState } from "react";
import type {
  DailyLedgerDayRow,
  DailyLedgerFundDeposit,
  DailyLedgerMemberColumn,
} from "@dang/contracts";
import { Amount } from "@dang/ui";
import {
  memberDayDepositCreditMinor,
  memberDayShareMinor,
} from "@/components/views/daily-ledger/daily-ledger-utils";
import styles from "./daily-ledger-share-panel.module.css";

type ShareRow = {
  userId: string;
  displayName: string;
  share: ReturnType<typeof memberDayShareMinor>;
  totalN: number;
  itemCount: number;
  deposits: DailyLedgerFundDeposit[];
};

function buildShareRows(
  day: DailyLedgerDayRow,
  members: readonly DailyLedgerMemberColumn[],
): ShareRow[] {
  const deposits = day.fundDeposits ?? [];
  return members.map((m, index) => {
    const personal = day.members[m.userId]?.total.amountMinor ?? "0";
    const depositCredit = memberDayDepositCreditMinor(deposits, m.userId);
    const share = memberDayShareMinor(
      personal,
      day.shared.total.amountMinor,
      members.length,
      index,
      depositCredit,
    );
    const memberDeposits = deposits.filter((dep) => {
      if (dep.kind !== "topup" && dep.kind !== "return") return false;
      const who = dep.cashInByUserId?.trim() || dep.actorUserId?.trim();
      return who === m.userId;
    });
    return {
      userId: m.userId,
      displayName: m.displayName,
      share,
      totalN: Number(share.total),
      itemCount: day.members[m.userId]?.items.length ?? 0,
      deposits: memberDeposits,
    };
  });
}

function pickDefaultUserId(
  rows: ShareRow[],
  preferUserId?: string | null,
): string | null {
  if (preferUserId && rows.some((r) => r.userId === preferUserId)) {
    return preferUserId;
  }
  const withDeposit = rows.find((r) => r.share.depositCredit !== "0");
  if (withDeposit) return withDeposit.userId;
  return rows[0]?.userId ?? null;
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0]!.slice(0, 1);
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`;
}

function Money({
  irrMinor,
  className,
  showUnit = true,
}: {
  irrMinor: string;
  className?: string;
  showUnit?: boolean;
}) {
  return (
    <span className={className ? `${styles.money} ${className}` : styles.money}>
      <Amount irrMinor={irrMinor} showUnit={showUnit} />
    </span>
  );
}

/**
 * Compact member share list + focused detail card for one person.
 * Avoids stacking full breakdowns for every member at once.
 */
export function DailyLedgerSharePanel({
  day,
  members,
  preferUserId = null,
}: {
  day: DailyLedgerDayRow;
  members: readonly DailyLedgerMemberColumn[];
  preferUserId?: string | null;
}) {
  const rows = buildShareRows(day, members);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(() =>
    pickDefaultUserId(rows, preferUserId),
  );

  useEffect(() => {
    const next = buildShareRows(day, members);
    setSelectedUserId((prev) => {
      if (prev && next.some((r) => r.userId === prev)) return prev;
      return pickDefaultUserId(next, preferUserId);
    });
  }, [day, members, preferUserId]);

  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.totalN)), 1);
  const selected = rows.find((r) => r.userId === selectedUserId) ?? null;
  const personalItems = selected
    ? (day.members[selected.userId]?.items ?? [])
    : [];
  const hasDepositCredit = selected
    ? selected.share.depositCredit !== "0"
    : false;

  if (members.length === 0) return null;

  return (
    <section className={styles.root} aria-label="سهم مصرف">
      <header className={styles.head}>
        <div className={styles.headText}>
          <h3 className={styles.title}>سهم مصرف</h3>
          <p className={styles.headMeta}>
            {members.length.toLocaleString("fa-IR")} نفر — برای جزئیات انتخاب کنید
          </p>
        </div>
      </header>

      <ul className={styles.list} role="listbox" aria-label="اعضا برای سهم مصرف">
        {rows.map((row) => {
          const barPct = Math.max(
            4,
            Math.round((Math.abs(row.totalN) / maxAbs) * 100),
          );
          const selectedRow = row.userId === selectedUserId;
          const hasDeposit = row.share.depositCredit !== "0";
          return (
            <li key={row.userId} className={styles.listItem}>
              <button
                type="button"
                role="option"
                aria-selected={selectedRow}
                className={
                  selectedRow ? `${styles.rowBtn} ${styles.rowBtnSelected}` : styles.rowBtn
                }
                onClick={() => setSelectedUserId(row.userId)}
              >
                <span className={styles.avatar} aria-hidden>
                  {memberInitials(row.displayName)}
                </span>
                <span className={styles.rowBody}>
                  <span className={styles.rowTop}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowName}>{row.displayName}</span>
                      {hasDeposit ? (
                        <span className={styles.depositBadge} title="واریز اعتبار">
                          واریز
                        </span>
                      ) : null}
                    </span>
                    <Money
                      irrMinor={row.share.total}
                      className={styles.rowTotal}
                      showUnit={false}
                    />
                  </span>
                  <span
                    className={styles.rowBar}
                    aria-hidden
                    style={{ ["--share-pct" as string]: `${barPct}%` }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <article
          className={styles.detail}
          aria-label={`جزئیات سهم ${selected.displayName}`}
        >
          <header className={styles.detailHead}>
            <div className={styles.detailIdentity}>
              <span className={styles.detailAvatar} aria-hidden>
                {memberInitials(selected.displayName)}
              </span>
              <div className={styles.detailIdentityText}>
                <span className={styles.detailEyebrow}>جزئیات سهم</span>
                <h4 className={styles.detailName}>{selected.displayName}</h4>
              </div>
            </div>
            <div className={styles.detailHeroBlock}>
              <span className={styles.detailHeroLabel}>سهم نهایی امروز</span>
              <Money irrMinor={selected.share.total} className={styles.detailHero} />
            </div>
          </header>

          <dl className={styles.formula} aria-label="فرمول سهم">
            <div className={styles.formulaRow}>
              <dt>مصرف</dt>
              <dd>
                <Money irrMinor={selected.share.consumption} />
              </dd>
            </div>
            <details
              key={`dep-${selected.userId}`}
              className={styles.depositDisclosure}
            >
              <summary
                className={styles.depositSummary}
                aria-label="باز و بسته کردن جزئیات واریز"
              >
                <span className={styles.depositSummaryLead}>
                  <span className={styles.depositChevron} aria-hidden>
                    <svg
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path
                        d="M2.5 4.5 L6 8 L9.5 4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className={styles.depositLabel}>واریز</span>
                  {hasDepositCredit ? (
                    <span className={styles.formulaTag}>اعتبار</span>
                  ) : null}
                </span>
                <span
                  className={
                    hasDepositCredit ? styles.formulaCredit : styles.formulaMinus
                  }
                >
                  −&nbsp;
                  <Money irrMinor={selected.share.depositCredit} />
                </span>
              </summary>
              <div
                className={styles.depositPanel}
                aria-label="جزئیات واریز اعتبار"
              >
                {selected.deposits.length > 0 ? (
                  <ul className={styles.depositList}>
                    {selected.deposits.map((dep) => (
                      <li key={dep.movementId} className={styles.depositItem}>
                        <span className={styles.depositFund}>{dep.fundName}</span>
                        <Money
                          irrMinor={dep.amountMinor}
                          className={styles.depositAmt}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.depositEmpty}>
                    برای این عضو امروز واریز اعتباری ثبت نشده است.
                  </p>
                )}
              </div>
            </details>
            <div className={`${styles.formulaRow} ${styles.formulaResult}`}>
              <dt>سهم نهایی</dt>
              <dd>
                <Money irrMinor={selected.share.total} />
              </dd>
            </div>
          </dl>

          <div className={styles.statGrid}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>فردی</span>
              <Money irrMinor={selected.share.personal} className={styles.statValue} />
              <span className={styles.statMeta}>
                {selected.itemCount.toLocaleString("fa-IR")} قلم
              </span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>سهم مشترک</span>
              <Money
                irrMinor={selected.share.sharedShare}
                className={styles.statValue}
              />
              <span className={styles.statMeta}>تقسیم‌شده بین اعضا</span>
            </div>
          </div>

          {personalItems.length > 0 ? (
            <details key={`items-${selected.userId}`} className={styles.fold}>
              <summary className={styles.foldSummary}>
                <span className={styles.foldLead}>
                  <span className={styles.foldChevron} aria-hidden>
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path
                        d="M2.5 4.5 L6 8 L9.5 4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className={styles.blockLabel}>اقلام فردی</span>
                </span>
                <span className={styles.sectionCount}>
                  {personalItems.length.toLocaleString("fa-IR")} قلم
                </span>
              </summary>
              <ul className={styles.itemList}>
                {personalItems.slice(0, 4).map((it) => (
                  <li key={it.expenseId} className={styles.itemRow}>
                    <span className={styles.itemDot} aria-hidden />
                    <span className={styles.itemTitle} title={it.title}>
                      {it.title}
                    </span>
                    <Money irrMinor={it.amount.amountMinor} className={styles.itemAmt} />
                  </li>
                ))}
              </ul>
              {personalItems.length > 4 ? (
                <p className={styles.moreHint}>
                  و {(personalItems.length - 4).toLocaleString("fa-IR")} قلم دیگر در
                  جدول روز
                </p>
              ) : null}
            </details>
          ) : null}
        </article>
      ) : null}

      <footer className={styles.footer}>
        <span className={styles.footerLabel}>جمع مشترک روز</span>
        <Money irrMinor={day.shared.total.amountMinor} className={styles.footerAmt} />
      </footer>
    </section>
  );
}
