"use client";

import type { DailyLedgerResponse } from "@dang/contracts";
import { formatJalaliIso } from "@dang/contracts";
import { Button, TextField } from "@dang/ui";
import { StatusLine } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";

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
  const selection = useRowSelection(activeLocks.map((l) => l.id));

  function unlockSelected() {
    if (selection.selectedCount === 0) return;
    const ids = selection.selectedIds;
    const label =
      ids.length === 1
        ? "این قفل بازه باز شود؟"
        : `${ids.length.toLocaleString("fa-IR")} قفل باز شوند؟`;
    if (!window.confirm(label)) return;
    for (const id of ids) onUnlock(id);
    selection.clear();
  }

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
          <>
            <SelectionActionBar
              selectedCount={selection.selectedCount}
              idleHint="روی ردیف کلیک کنید یا مربع کنارش را تیک بزنید"
              onClear={selection.clear}
            >
              <button
                type="button"
                className={selStyles.danger}
                disabled={selection.selectedCount === 0 || pending}
                onClick={unlockSelected}
              >
                باز کردن
              </button>
            </SelectionActionBar>
            <ul className="dlLockList">
              {activeLocks.map((l) => (
                <li
                  key={l.id}
                  className={selStyles.selectableRow}
                  {...rowSelectActivateProps({
                    onActivate: () => selection.toggle(l.id),
                  })}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <RowSelectCheckbox
                      checked={selection.isSelected(l.id)}
                      onChange={() => selection.toggle(l.id)}
                      label={`انتخاب قفل ${formatJalaliIso(l.from)} تا ${formatJalaliIso(l.to)}`}
                    />
                    {formatJalaliIso(l.from)} → {formatJalaliIso(l.to)}
                    {l.reason ? ` · ${l.reason}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </details>
  );
}
