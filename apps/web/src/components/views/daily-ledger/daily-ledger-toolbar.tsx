"use client";

import Link from "next/link";
import type { DailyLedgerRangePreset, WorkspaceSummary } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import "./daily-ledger-buttons.module.css";
import { JalaliDateField } from "@/components/jalali-date-field";
import { rangeHeadline } from "@/components/views/daily-ledger/daily-ledger-utils";

type DailyLedgerToolbarProps = {
  workspaces: WorkspaceSummary[];
  workspaceId: string;
  settlementsHref: string;
  onWorkspaceChange: (id: string) => void;
  preset: DailyLedgerRangePreset;
  from: string;
  to: string;
  daysCount: number;
  showCustomRange: boolean;
  /** Optional legacy table/cards toggle — omit for overview-only UX. */
  viewMode?: "table" | "cards";
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
  onSelectViewMode?: (mode: "table" | "cards") => void;
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
  settlementsHref,
  onWorkspaceChange,
  preset,
  from,
  to,
  daysCount,
  showCustomRange,
  viewMode,
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

      <div className="dlToolbarActions">
        {viewMode != null && onSelectViewMode ? (
          <div className="dlPresets" role="group" aria-label="نمایش">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={viewMode === "table" ? "focusChip pfFocusChip isActive" : "focusChip pfFocusChip"}
              aria-pressed={viewMode === "table"}
              onClick={() => onSelectViewMode("table")}
            >
              جدول
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={viewMode === "cards" ? "focusChip pfFocusChip isActive" : "focusChip pfFocusChip"}
              aria-pressed={viewMode === "cards"}
              onClick={() => onSelectViewMode("cards")}
            >
              کارت
            </Button>
          </div>
        ) : null}
        <Button type="button" onClick={onExportCsv} disabled={!workspaceId || !hasLedger}>
          خروجی CSV
        </Button>
        <Link className="dlLinkBtn" href={settlementsHref}>
          تسویه
        </Link>
      </div>

      <div className="dlPeriodNav" role="group" aria-label="جابه‌جایی بازه">
        <Button type="button" variant="ghost" size="sm" className="dlNavBtn" onClick={() => onShiftPeriod(-1)} aria-label="بازه قبل">
          ›
        </Button>
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
        <Button type="button" variant="ghost" size="sm" className="dlNavBtn" onClick={() => onShiftPeriod(1)} aria-label="بازه بعد">
          ‹
        </Button>
        <Button type="button" variant="ghost" size="sm" className="focusChip pfFocusChip" onClick={onGoToday}>
          برو به امروز
        </Button>
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
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="sm"
            className={preset === id ? "focusChip pfFocusChip isActive" : "focusChip pfFocusChip"}
            aria-pressed={preset === id}
            onClick={() => onApplyPreset(id)}
          >
            {label}
          </Button>
        ))}
        <TextField
          label="تعداد روز"
          type="number"
          min={1}
          max={93}
          value={String(daysCount)}
          inputMode="numeric"
          error={
            !Number.isFinite(daysCount) || daysCount < 1 || daysCount > 93
              ? "بین ۱ تا ۹۳ روز"
              : undefined
          }
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onApplyDaysCount(n);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={showCustomRange || preset === "custom" ? "focusChip pfFocusChip isActive" : "focusChip pfFocusChip"}
          aria-pressed={showCustomRange || preset === "custom"}
          onClick={onToggleCustomRange}
        >
          بازه دستی
        </Button>
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
    </div>
  );
}
