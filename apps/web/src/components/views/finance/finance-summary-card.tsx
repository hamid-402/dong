"use client";

import Link from "next/link";
import type { WorkspaceBalancesResponse } from "@dang/contracts";
import { isFundPartyId } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { DataList, DataRow, EmptyHint, SectionCard } from "@/components/ui-blocks";
import { memberStatementHref } from "@/lib/statement-links";
import { NAV_LABELS } from "@/lib/nav-labels";

function balancePhrase(amountMinor: string) {
  const value = BigInt(amountMinor);
  if (value > 0n) return "طلبکار";
  if (value < 0n) return "بدهکار";
  return "تسویه";
}

function partyTitle(
  userId: string,
  memberLabel: (userId: string) => string,
): string {
  if (isFundPartyId(userId)) return "صندوق تنخواه";
  return memberLabel(userId);
}

type FinanceSummaryCardProps = {
  balances: WorkspaceBalancesResponse | null;
  memberLabel: (userId: string) => string;
  /** When set, each row links to that member's share-based statement (current month). */
  slug?: string | null;
  /** Session user — settle-link CTA for own debt. */
  currentUserId?: string;
  /** Finance/owner may offer settle-link on any debtor row. */
  canManage?: boolean;
  /** Gateway checkout available (local_psp or zarinpal). */
  paymentsLive?: boolean;
  /** Create claim + payment link for a debtor balance line. */
  onCreateSettleLink?: (debtorUserId: string, debtAbsMinor: string) => void;
  pending?: boolean;
  readOnly?: boolean;
};

export function FinanceSummaryCard({
  balances,
  memberLabel,
  slug,
  currentUserId,
  canManage = false,
  paymentsLive = false,
  onCreateSettleLink,
  pending = false,
  readOnly = false,
}: FinanceSummaryCardProps) {
  const equalDebtorHint = (() => {
    if (!balances || balances.lines.length < 2) return null;
    const debtors = balances.lines.filter(
      (l) => !isFundPartyId(l.userId) && BigInt(l.net.amountMinor) < 0n,
    );
    if (debtors.length < 2) return null;
    const amounts = new Set(
      debtors.map((l) =>
        l.net.amountMinor.startsWith("-")
          ? l.net.amountMinor.slice(1)
          : l.net.amountMinor,
      ),
    );
    if (amounts.size !== 1) return null;
    return "چند بدهکار ماندهٔ یکسان دارند — معمولاً به‌خاطر تقسیم مساوی خرج‌های مشترک است (منطقی و درست است).";
  })();

  return (
    <SectionCard
      title="مانده اعضا و صندوق"
      badge={balances?.lines.length ?? 0}
      delayClass="delay2"
    >
      {equalDebtorHint ? <p className="liveHint">{equalDebtorHint}</p> : null}
      <p className="liveHint">
        ماندهٔ مثبت = طلب از دیگران/صندوق؛ منفی = بدهی. وقتی خرج از تنخواه باشد بدهی به
        صندوق است؛ جبران خرج شخصی هم از مسیر صندوق دیده می‌شود.
      </p>
      <DataList>
        {!balances || balances.lines.length === 0 ? (
          <EmptyHint>ماندهٔ باز نیست.</EmptyHint>
        ) : (
          balances.lines.map((line) => {
            const net = BigInt(line.net.amountMinor);
            const isDebtor = net < 0n;
            const isFund = isFundPartyId(line.userId);
            const debtAbs = isDebtor ? (-net).toString() : "0";
            const showSettleLink =
              !isFund &&
              paymentsLive &&
              !readOnly &&
              Boolean(onCreateSettleLink) &&
              isDebtor &&
              (canManage || currentUserId === line.userId);
            return (
              <DataRow
                key={line.userId}
                title={partyTitle(line.userId, memberLabel)}
                meta={
                  isFund
                    ? net > 0n
                      ? "طلب صندوق از اعضا"
                      : "بدهی صندوق به اعضا (جبران)"
                    : balancePhrase(line.net.amountMinor)
                }
                trailing={
                  <Amount
                    irrMinor={
                      line.net.amountMinor.startsWith("-")
                        ? line.net.amountMinor.slice(1)
                        : line.net.amountMinor
                    }
                  />
                }
                actions={
                  !isFund && (showSettleLink || slug) ? (
                    <>
                      {slug ? (
                        <Link
                          className="textButton"
                          href={memberStatementHref(slug, line.userId)}
                        >
                          {NAV_LABELS.statements}
                        </Link>
                      ) : null}
                      {showSettleLink ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => onCreateSettleLink?.(line.userId, debtAbs)}
                        >
                          {currentUserId === line.userId
                            ? "لینک پرداخت بدهی"
                            : "لینک تسویه"}
                        </Button>
                      ) : null}
                    </>
                  ) : undefined
                }
              />
            );
          })
        )}
      </DataList>
    </SectionCard>
  );
}
