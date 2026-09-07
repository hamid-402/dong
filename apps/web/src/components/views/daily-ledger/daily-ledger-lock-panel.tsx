"use client";

import type { DailyLedgerResponse } from "@dang/contracts";
import { formatJalaliIso } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { StatusLine } from "@/components/ui-blocks";

type DailyLedgerLockPanelProps = {
  rangeLocks: DailyLedgerResponse["rangeLocks"];
  from: string;
  to: string;
  lockReason: string;
  onLockReasonChange: (value: string) => void;
  onLockRange: () => void;
  onUnlock: (lockId: string) => void;
  pending: boolean;
};

/**
 * Range-lock (close month/period) management panel for the daily ledger.
 * Extracted from daily-ledger-view.tsx (dong-50 #29) — owner/admin/finance only; driven by parent state.
 */
export function DailyLedgerLockPanel({
  rangeLocks,
  from,
  to,
  lockReason,
  onLockReasonChange,
  onLockRange,
  onUnlock,
  pending,
}: DailyLedgerLockPanelProps) {
  const activeLocks = rangeLocks.filter((l) => l.active);
  return (
    <details className="reportDetails">
      <summary>
        <span>قفل بازه (بستن ماه/دوره)</span>
        <span>{activeLocks.length} فعال</span>
      </summary>
      <div className="reportDetails__body">
        <StatusLine>
          فقط owner/admin/finance — پس از قفل، ثبت و ویرایش قلم در بازه بسته می‌شود.
        </StatusLine>
        <TextField
          label="دلیل (اختیاری)"
          value={lockReason}
          onChange={(e) => onLockReasonChange(e.target.value)}
          placeholder="بستن ماه شهریور"
        />
        <div className="dlModalActions">
          <Button type="button" onClick={onLockRange} disabled={pending}>
            قفل {formatJalaliIso(from)} تا {formatJalaliIso(to)}
          </Button>
        </div>
        {activeLocks.length > 0 ? (
          <ul className="dlLockList">
            {activeLocks.map((l) => (
              <li key={l.id}>
                <span>
                  {formatJalaliIso(l.from)} → {formatJalaliIso(l.to)}
                  {l.reason ? ` · ${l.reason}` : ""}
                </span>
                <button type="button" className="dlItemBtn" onClick={() => onUnlock(l.id)}>
                  باز کردن
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
