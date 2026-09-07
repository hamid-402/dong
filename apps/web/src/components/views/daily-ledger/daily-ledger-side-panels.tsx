"use client";

import Link from "next/link";
import type {
  DailyLedgerResponse,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import { suggestMinimalSettlements } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import { hubPathFor } from "@/lib/hub-links";

type DailyLedgerSidePanelsProps = {
  balances: WorkspaceBalancesResponse | null;
  members: DailyLedgerResponse["members"];
  importCsv: string;
  onImportCsvChange: (value: string) => void;
  onRunImport: () => void;
  pending: boolean;
  readOnly?: boolean;
};

/**
 * Secondary panels for the daily ledger: settlement suggestions from real balances
 * and CSV import. Extracted from daily-ledger-view.tsx — driven by parent state.
 */
export function DailyLedgerSidePanels({
  balances,
  members,
  importCsv,
  onImportCsvChange,
  onRunImport,
  pending,
  readOnly = false,
}: DailyLedgerSidePanelsProps) {
  return (
    <>
      {balances && balances.lines.length > 0 ? (
        <details className="reportDetails">
          <summary>
            <span>پیشنهاد تسویه از مانده واقعی</span>
            <span>{balances.source}</span>
          </summary>
          <div className="reportDetails__body">
            <StatusLine>
              از ژورنال مانده‌ها (نه فقط مصرف دفتر) — برای ثبت به صفحه مالی بروید.
            </StatusLine>
            <ul className="dlSettleList">
              {suggestMinimalSettlements(balances.lines).map((s, i) => {
                const nameOf = (id: string) =>
                  members.find((m) => m.userId === id)?.displayName ?? id.slice(0, 8);
                return (
                  <li key={`${s.fromUserId}-${s.toUserId}-${i}`}>
                    <span>
                      {nameOf(s.fromUserId)} → {nameOf(s.toUserId)}
                    </span>
                    <Amount irrMinor={s.amount.amountMinor} />
                  </li>
                );
              })}
            </ul>
            {suggestMinimalSettlements(balances.lines).length === 0 ? (
              <EmptyHint>مانده‌ای برای تسویه نیست.</EmptyHint>
            ) : (
              <Link className="dlLinkBtn" href={`${hubPathFor("/workspaces")}#settlement-panel`}>
                ثبت تسویه در مالی
              </Link>
            )}
          </div>
        </details>
      ) : null}

      {readOnly ? (
        <StatusLine>نقش شما فقط مشاهده دارد — ورود CSV و ثبت قلم فعال نیست.</StatusLine>
      ) : (
      <details className="reportDetails">
        <summary>
          <span>ورود CSV</span>
          <span>date,column,item,toman</span>
        </summary>
        <div className="reportDetails__body">
          <StatusLine>
            ستون: نام عضو یا <code>shared</code> · مبلغ به تومان · فقط روزهای غیرتعطیل
          </StatusLine>
          <textarea
            className="dlImportArea"
            rows={5}
            value={importCsv}
            onChange={(e) => onImportCsvChange(e.target.value)}
            placeholder={"2026-09-12,حمید,چای,5000\n2026-09-12,shared,نان,20000"}
          />
          <Button type="button" onClick={onRunImport} disabled={pending || !importCsv.trim()}>
            ورود به دفتر
          </Button>
        </div>
      </details>
      )}
    </>
  );
}
