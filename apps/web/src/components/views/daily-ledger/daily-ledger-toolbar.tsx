"use client";

import Link from "next/link";
import type { DailyLedgerRangePreset, WorkspaceSummary } from "@dang/contracts";
import { Button, SelectField } from "@dang/ui";
import { JalaliDateField } from "@/components/jalali-date-field";
import { hubPathFor } from "@/lib/hub-links";
import { rangeHeadline } from "@/components/views/daily-ledger/daily-ledger-utils";

type DailyLedgerToolbarProps = {
  workspaces: WorkspaceSummary[];
  workspaceId: string;
  onWorkspaceChange: (id: string) => void;
  preset: DailyLedgerRangePreset;
  from: string;
  to: string;
  daysCount: number;
  showCustomRange: boolean;
  viewMode: "table" | "cards";
  showGregorian: boolean;
  pending: boolean;
  hasLedger: boolean;
  onShiftPeriod: (delta: -1 | 1) => void;
  onGoToday: () => void;
  onApplyPreset: (preset: DailyLedgerRangePreset) => void;
  onApplyDaysCount: (n: number) => void;
  onToggleCustomRange: () => void;
  onCustomFrom: (iso: string) => void;
  onCustomTo: (iso: string) => void;
  onApplyCustom: () => void;
  onSelectViewMode: (mode: "table" | "cards") => void;
  onToggleGregorian: () => void;
  onExportCsv: () => void;
};

/**
 * Toolbar for the daily ledger: workspace select, period navigation, presets,
 * custom range, and view/export actions. Extracted from daily-ledger-view.tsx —
 * fully driven by parent state + handlers.
 */
export function DailyLedgerToolbar({
  workspaces,
  workspaceId,
  onWorkspaceChange,
  preset,
  from,
  to,
  daysCount,
  showCustomRange,
  viewMode,
  showGregorian,
  pending,
  hasLedger,
  onShiftPeriod,
  onGoToday,
  onApplyPreset,
  onApplyDaysCount,
  onToggleCustomRange,
  onCustomFrom,
  onCustomTo,
  onApplyCustom,
  onSelectViewMode,
  onToggleGregorian,
  onExportCsv,
}: DailyLedgerToolbarProps) {
  return (
    <div className="dlToolbar">
      <SelectField
        label="فضا / گروه"
        value={workspaceId}
        onChange={(e) => onWorkspaceChange(e.target.value)}
      >
        {workspaces.length === 0 ? <option value="">فضایی نیست</option> : null}
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </SelectField>

      <div className="dlPeriodNav" role="group" aria-label="جابه‌جایی بازه">
        <button type="button" className="dlNavBtn" onClick={() => onShiftPeriod(-1)} aria-label="بازه قبل">
          ›
        </button>
        <div className="dlPeriodMeta">
          <strong>{rangeHeadline(from, to, preset)}</strong>
          <span>
            {preset === "week"
              ? "شنبه تا جمعه"
              : preset === "month"
                ? "ماه شمسی"
                : preset === "year"
                  ? "سال شمسی"
                  : `${Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1)} روز`}
          </span>
        </div>
        <button type="button" className="dlNavBtn" onClick={() => onShiftPeriod(1)} aria-label="بازه بعد">
          ‹
        </button>
        <button type="button" className="pfFocusChip" onClick={onGoToday}>
          برو به امروز
        </button>
      </div>

      <div className="dlPresets" role="group" aria-label="بازه">
        {(
          [
            ["day", "امروز"],
            ["week", "هفته"],
            ["month", "ماه"],
            ["year", "سال"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={preset === id ? "pfFocusChip isActive" : "pfFocusChip"}
            onClick={() => onApplyPreset(id)}
          >
            {label}
          </button>
        ))}
        <label className={preset === "days" ? "dlDaysChip isActive" : "dlDaysChip"}>
          <span>آخر</span>
          <input
            type="number"
            min={1}
            max={93}
            value={daysCount}
            onChange={(e) => onApplyDaysCount(Number(e.target.value))}
            aria-label="تعداد روز"
          />
          <span>روز</span>
        </label>
        <button
          type="button"
          className={showCustomRange || preset === "custom" ? "pfFocusChip isActive" : "pfFocusChip"}
          onClick={onToggleCustomRange}
        >
          بازه دستی
        </button>
      </div>

      {showCustomRange || preset === "custom" ? (
        <div className="dlCustomRange">
          <JalaliDateField label="از" value={from} onChange={onCustomFrom} />
          <JalaliDateField label="تا" value={to} onChange={onCustomTo} />
          <Button type="button" onClick={onApplyCustom} disabled={pending || !workspaceId}>
            {pending ? "…" : "اعمال"}
          </Button>
        </div>
      ) : null}

      <div className="dlToolbarActions">
        <div className="dlPresets" role="group" aria-label="نمایش">
          <button
            type="button"
            className={viewMode === "table" ? "pfFocusChip isActive" : "pfFocusChip"}
            onClick={() => onSelectViewMode("table")}
          >
            جدول
          </button>
          <button
            type="button"
            className={viewMode === "cards" ? "pfFocusChip isActive" : "pfFocusChip"}
            onClick={() => onSelectViewMode("cards")}
          >
            کارت
          </button>
          <button
            type="button"
            className={showGregorian ? "pfFocusChip isActive" : "pfFocusChip"}
            onClick={onToggleGregorian}
          >
            میلادی
          </button>
        </div>
        <Button type="button" onClick={onExportCsv} disabled={!workspaceId || !hasLedger}>
          خروجی CSV
        </Button>
        <Link className="dlLinkBtn" href={`${hubPathFor("/workspaces")}#settlement-panel`}>
          تسویه
        </Link>
      </div>
    </div>
  );
}
