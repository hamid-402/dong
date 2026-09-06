"use client";

import type { WorkspaceBalancesResponse } from "@dang/contracts";
import { Amount } from "@dang/ui";
import { DataList, DataRow, EmptyHint, SectionCard } from "@/components/ui-blocks";

function balancePhrase(amountMinor: string) {
  const value = BigInt(amountMinor);
  if (value > 0n) return "طلبکار";
  if (value < 0n) return "بدهکار";
  return "تسویه";
}

type FinanceSummaryCardProps = {
  balances: WorkspaceBalancesResponse | null;
  memberLabel: (userId: string) => string;
};

export function FinanceSummaryCard({ balances, memberLabel }: FinanceSummaryCardProps) {
  return (
    <SectionCard title="مانده اعضا" badge={balances?.lines.length ?? 0} delayClass="delay2">
      <DataList>
        {!balances || balances.lines.length === 0 ? (
          <EmptyHint>ماندهٔ باز نیست.</EmptyHint>
        ) : (
          balances.lines.map((line) => (
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
            />
          ))
        )}
      </DataList>
    </SectionCard>
  );
}
