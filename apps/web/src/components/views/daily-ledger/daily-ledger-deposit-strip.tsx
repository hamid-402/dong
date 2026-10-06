"use client";

import type { DailyLedgerFundDeposit, DailyLedgerMemberColumn } from "@dang/contracts";
import { Amount } from "@dang/ui";

function memberName(
  members: readonly DailyLedgerMemberColumn[],
  userId: string | undefined,
): string {
  if (!userId) return "عضو";
  return members.find((m) => m.userId === userId)?.displayName ?? "عضو";
}

function kindLabel(kind: DailyLedgerFundDeposit["kind"]): string {
  if (kind === "gift") return "هدیه";
  if (kind === "topup") return "اعتبار عضو";
  if (kind === "return") return "بازگشت";
  return kind;
}

/** Day strip of petty-cash inflows — excluded from consumption totals. */
export function DailyLedgerDepositStrip({
  deposits,
  members,
}: {
  deposits: readonly DailyLedgerFundDeposit[];
  members: readonly DailyLedgerMemberColumn[];
}) {
  if (!deposits.length) return null;
  return (
    <div className="dlDepositStrip" aria-label="واریز به صندوق در این روز">
      <span className="dlDepositStripLabel">واریز صندوق</span>
      <ul className="dlDepositList">
        {deposits.map((dep) => {
          const who = memberName(members, dep.cashInByUserId ?? dep.actorUserId);
          return (
            <li key={dep.movementId} className="dlDepositItem">
              <span className="dlDepositWho">{who}</span>
              <span className="dlDepositKind">{kindLabel(dep.kind)}</span>
              <b className="dlDepositAmt">
                <Amount irrMinor={dep.amountMinor} />
              </b>
              <span className="dlDepositFund">{dep.fundName}</span>
              {dep.note ? (
                <span className="dlDepositNote" title={dep.note}>
                  {dep.note.length > 40 ? `${dep.note.slice(0, 40)}…` : dep.note}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
