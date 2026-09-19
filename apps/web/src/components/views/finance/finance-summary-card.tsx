"use client";

import Link from "next/link";
import type { WorkspaceBalancesResponse } from "@dang/contracts";
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
  return (
    <SectionCard title="مانده اعضا" badge={balances?.lines.length ?? 0} delayClass="delay2">
      <DataList>
        {!balances || balances.lines.length === 0 ? (
          <EmptyHint>ماندهٔ باز نیست.</EmptyHint>
        ) : (
          balances.lines.map((line) => {
            const net = BigInt(line.net.amountMinor);
            const isDebtor = net < 0n;
            const debtAbs = isDebtor ? (-net).toString() : "0";
            const showSettleLink =
              paymentsLive &&
              !readOnly &&
              Boolean(onCreateSettleLink) &&
              isDebtor &&
              (canManage || currentUserId === line.userId);
            return (
              <DataRow
                key={line.userId}
                title={memberLabel(line.userId)}
                meta={balancePhrase(line.net.amountMinor)}
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
                  showSettleLink || slug ? (
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
