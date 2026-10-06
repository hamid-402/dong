"use client";

import Link from "next/link";
import type { PettyCashFundSummary, SpaceKind } from "@dang/contracts";
import {
  pettyCashAllowedForKind,
  treasuryLabelsForKind,
} from "@dang/contracts";
import { Amount, Button, displayUnitLabel } from "@dang/ui";
import { useDisplayUnit } from "@/lib/display-unit";
import styles from "./treasury-balance-card.module.css";

/**
 * Live petty-cash (تنخواه) strip — members see balance; finance can ensure/create.
 * Personal spaces show savings fund balance from API (goals contributions).
 */
export function TreasuryBalanceCard({
  spaceKind,
  funds,
  paymentsHref,
  savingsHref,
  canManage,
  pending,
  onEnsureDefault,
  density = "default",
  memberLabel,
  savingsBalanceMinor,
  savingsGoalCount,
  onEnsureSavings,
  onDepositSavings,
}: {
  spaceKind: SpaceKind;
  funds: PettyCashFundSummary[];
  paymentsHref: string;
  /** Personal savings / goals hub when kind=personal */
  savingsHref?: string;
  canManage: boolean;
  pending?: boolean;
  onEnsureDefault?: () => void;
  density?: "default" | "compact";
  /** Resolve custodian userId → display name (members only). */
  memberLabel?: (userId: string) => string;
  /** Personal: live IRR minor from /me/finance/savings-fund */
  savingsBalanceMinor?: string | null;
  savingsGoalCount?: number;
  onEnsureSavings?: () => void;
  onDepositSavings?: () => void;
}) {
  const unit = useDisplayUnit();
  const unitLabel = displayUnitLabel(unit);
  const labels = treasuryLabelsForKind(spaceKind);

  if (!pettyCashAllowedForKind(spaceKind)) {
    const hasBalance = savingsBalanceMinor != null;
    return (
      <section
        className={`${styles.card} ${styles.personal} ${density === "compact" ? styles.compact : ""}`}
        aria-label={labels.balanceTitle}
      >
        <div className={styles.glow} aria-hidden />
        <div className={styles.head}>
          <p className={styles.kicker}>{labels.balanceTitle}</p>
          <h3 className={styles.title}>صندوق پس‌انداز شخصی</h3>
          <p className={styles.lede}>
            {hasBalance && (savingsGoalCount ?? 0) > 0
              ? `${(savingsGoalCount ?? 0).toLocaleString("fa-IR")} هدف فعال · واریز ماهانه تا رسیدن به هدف`
              : "تنخواه مشترک نیست — ماهانه مبلغی را در صندوق ثبت کنید تا به هدف برسید."}
          </p>
        </div>
        <div className={styles.balanceBlock}>
          {hasBalance ? (
            <>
              <Amount
                irrMinor={savingsBalanceMinor}
                showUnit={false}
                className={styles.amount}
              />
              <span className={styles.unit}>{unitLabel}</span>
            </>
          ) : (
            <span className={styles.emptyAmount}>—</span>
          )}
        </div>
        <div className={styles.actions}>
          {savingsHref ? (
            <Link className={styles.ctaLink} href={savingsHref}>
              مدیریت پس‌انداز و اهداف
            </Link>
          ) : null}
          {!hasBalance || (savingsGoalCount ?? 0) === 0 ? (
            onEnsureSavings ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={onEnsureSavings}
              >
                ایجاد صندوق پس‌انداز
              </Button>
            ) : null
          ) : onDepositSavings ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onDepositSavings}
            >
              واریز ماهانه
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const active = funds.filter((f) => f.active);
  const primary = active[0] ?? null;
  const totalMinor = active
    .reduce((acc, f) => acc + BigInt(f.balanceMinor || "0"), 0n)
    .toString();
  const custodianName =
    primary?.custodianUserId && memberLabel
      ? memberLabel(primary.custodianUserId)
      : null;

  return (
    <section
      className={`${styles.card} ${density === "compact" ? styles.compact : ""}`}
      aria-label={labels.balanceTitle}
    >
      <div className={styles.glow} aria-hidden />
      <div className={styles.head}>
        <p className={styles.kicker}>{labels.pettyCash}</p>
        <h3 className={styles.title}>{labels.balanceTitle}</h3>
        {primary ? (
          <p className={styles.lede}>
            {primary.name}
            {active.length > 1 ? ` · ${active.length} صندوق فعال` : ""}
            {custodianName
              ? ` · ${labels.custodian}: ${custodianName}`
              : primary.custodianUserId
                ? ` · ${labels.custodian}`
                : ""}
          </p>
        ) : (
          <p className={styles.lede}>
            هنوز صندوقی نیست. {labels.financeRole} می‌تواند تنخواه اصلی را بسازد.
          </p>
        )}
      </div>

      <div className={styles.balanceBlock}>
        {primary ? (
          <>
            <Amount
              irrMinor={totalMinor}
              showUnit={false}
              className={styles.amount}
            />
            <span className={styles.unit}>{unitLabel}</span>
          </>
        ) : (
          <span className={styles.emptyAmount}>—</span>
        )}
      </div>

      <div className={styles.actions}>
        <Link className={styles.ctaLink} href={paymentsHref}>
          مدیریت {labels.pettyCash}
        </Link>
        {!primary && canManage && onEnsureDefault ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onEnsureDefault}
          >
            {labels.ensureFundCta}
          </Button>
        ) : null}
        {primary && active.length >= 1 && canManage ? (
          <Link className={styles.quietLink} href={`${paymentsHref}#petty-cash`}>
            افزودن صندوق دیگر
          </Link>
        ) : null}
      </div>
    </section>
  );
}
