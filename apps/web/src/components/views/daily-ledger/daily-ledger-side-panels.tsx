"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import type {
  DailyLedgerResponse,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import { suggestMinimalSettlements, settlementEdgeLabelFa } from "@dang/contracts";
import { Amount, Button, displayUnitLabel, formatMoneyFromIrrMinor } from "@dang/ui";
import { EmptyHint, StatusLine } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { useDisplayUnit } from "@/lib/display-unit";
import { NAV_LABELS } from "@/lib/nav-labels";

export type LedgerColumnMapDraft = Record<string, string>;

type ImportPreviewRow = {
  date: string;
  column: string;
  itemName: string;
  amountToman: number;
  resolved: string;
};

type DailyLedgerSidePanelsProps = {
  balances: WorkspaceBalancesResponse | null;
  members: DailyLedgerResponse["members"];
  settlementsHref: string;
  importCsv: string;
  onImportCsvChange: (value: string) => void;
  onRunImport: () => void;
  onImportXlsxFile?: (file: File) => void;
  unmappedColumns?: string[];
  columnMap?: LedgerColumnMapDraft;
  onColumnMapChange?: (column: string, value: string) => void;
  onConfirmMappedImport?: () => void;
  importPreview?: ImportPreviewRow[];
  onImportPreviewChange?: (rows: ImportPreviewRow[]) => void;
  sheetSource?: "auto" | "master" | "members";
  onSheetSourceChange?: (value: "auto" | "master" | "members") => void;
  pending: boolean;
  readOnly?: boolean;
};

/**
 * Secondary panels for the daily ledger: settlement suggestions from real balances
 * and Excel/CSV import (paste + file + preview + column↔member mapping).
 */
export function DailyLedgerSidePanels({
  balances,
  members,
  settlementsHref,
  importCsv,
  onImportCsvChange,
  onRunImport,
  onImportXlsxFile,
  unmappedColumns = [],
  columnMap = {},
  onColumnMapChange,
  onConfirmMappedImport,
  importPreview = [],
  onImportPreviewChange,
  sheetSource = "auto",
  onSheetSourceChange,
  pending,
  readOnly = false,
}: DailyLedgerSidePanelsProps) {
  const displayUnit = useDisplayUnit();
  const unitLabel = displayUnitLabel(displayUnit);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewIds = useMemo(
    () => importPreview.map((_, i) => String(i)),
    [importPreview],
  );
  const previewSelection = useRowSelection(previewIds);
  const mapReady =
    unmappedColumns.length === 0 ||
    unmappedColumns.every((c) => Boolean(columnMap[c]?.trim()));
  const canCommit =
    Boolean(onConfirmMappedImport) &&
    importPreview.length > 0 &&
    mapReady;

  /** Import API stores تومان; UI edits in the active display unit. */
  function previewAmountToDisplay(amountToman: number): number {
    return displayUnit === "toman" ? amountToman : amountToman * 10;
  }
  function displayToPreviewAmountToman(display: number): number {
    const n = Math.max(1, Math.round(display));
    return displayUnit === "toman" ? n : Math.max(1, Math.round(n / 10));
  }

  function deletePreviewSelected() {
    if (!onImportPreviewChange || previewSelection.selectedCount === 0) return;
    const idxs = new Set(previewSelection.selectedIds.map((id) => Number(id)));
    const label =
      idxs.size === 1
        ? "این ردیف پیش‌نمایش حذف شود؟"
        : `${idxs.size.toLocaleString("fa-IR")} ردیف حذف شوند؟`;
    if (!window.confirm(label)) return;
    onImportPreviewChange(importPreview.filter((_, i) => !idxs.has(i)));
    previewSelection.clear();
  }

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
              {readOnly
                ? "از ژورنال مانده‌ها (نه فقط مصرف دفتر)."
                : "از ژورنال مانده‌ها (نه فقط مصرف دفتر) — برای ثبت به صفحه مالی بروید."}
            </StatusLine>
            <ul className="dlSettleList">
              {suggestMinimalSettlements(balances.lines).map((s, i) => {
                const nameOf = (id: string) =>
                  members.find((m) => m.userId === id)?.displayName ?? id.slice(0, 8);
                const shareText = `${nameOf(s.fromUserId)} ${formatMoneyFromIrrMinor(s.amount.amountMinor, displayUnit)} به ${nameOf(s.toUserId)} بدهکار است`;
                return (
                  <li key={`${s.fromUserId}-${s.toUserId}-${i}`}>
                    <span>
                      {settlementEdgeLabelFa({
                        fromPartyId: s.fromUserId,
                        toPartyId: s.toUserId,
                        memberLabel: nameOf,
                      })}
                    </span>
                    <Amount irrMinor={s.amount.amountMinor} />
                    {!readOnly ? (
                      <button
                        type="button"
                        className="textButton"
                        onClick={() => {
                          void navigator.clipboard.writeText(shareText);
                        }}
                      >
                        کپی
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {suggestMinimalSettlements(balances.lines).length === 0 ? (
              <EmptyHint>مانده‌ای برای تسویه نیست.</EmptyHint>
            ) : readOnly ? null : (
              <Link className="dlLinkBtn" href={settlementsHref}>
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
            <span>ورود از جدول</span>
            <span>Dong-To / Excel · پیش‌نمایش → تأیید</span>
          </summary>
          <div className="reportDetails__body">
            <StatusLine>
              Paste جدول عمومی یا فایل <code>.xlsx</code> — اول پیش‌نمایش می‌آید، بعد از
              نگاشت (در صورت نیاز) تأیید ورود. ستون شرکت → هزینه مشترک. این همان{" "}
              {NAV_LABELS.dailyEntry} است، نه مسیر سوم.
            </StatusLine>
            {onSheetSourceChange ? (
              <label style={{ display: "grid", gap: 4, marginBottom: 8 }}>
                <span>منبع برگه Excel</span>
                <select
                  value={sheetSource}
                  onChange={(e) =>
                    onSheetSourceChange(
                      e.target.value as "auto" | "master" | "members",
                    )
                  }
                  disabled={pending}
                >
                  <option value="auto">خودکار (جدول عمومی اگر باشد)</option>
                  <option value="master">فقط جدول عمومی</option>
                  <option value="members">فقط برگه‌های عضو</option>
                </select>
              </label>
            ) : null}
            <textarea
              className="dlImportArea"
              rows={7}
              value={importCsv}
              onChange={(e) => onImportCsvChange(e.target.value)}
              placeholder={
                "ردیف\tروز\tتاریخ\tحمید\tقیمت\tشرکت\tقیمت6\tجمع\n1\tپنجشنبه\t1405/06/12\tچای\t5000\tنان\t20000\t25000"
              }
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Button
                type="button"
                onClick={onRunImport}
                disabled={pending || !importCsv.trim()}
              >
                پیش‌نمایش Paste / CSV
              </Button>
              {onImportXlsxFile ? (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImportXlsxFile(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => fileRef.current?.click()}
                  >
                    پیش‌نمایش فایل Excel
                  </Button>
                </>
              ) : null}
            </div>

            {importPreview.length > 0 ? (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <StatusLine>
                  پیش‌نمایش قابل ویرایش — سلول‌ها را اصلاح کنید؛ تا تأیید، چیزی ثبت نمی‌شود
                </StatusLine>
                {onImportPreviewChange ? (
                  <SelectionActionBar
                    selectedCount={previewSelection.selectedCount}
                    idleHint="روی ردیف کلیک کنید یا مربع کنارش را تیک بزنید"
                    onClear={previewSelection.clear}
                  >
                    <button
                      type="button"
                      className={selStyles.danger}
                      disabled={previewSelection.selectedCount === 0 || pending}
                      onClick={deletePreviewSelected}
                    >
                      حذف
                    </button>
                  </SelectionActionBar>
                ) : null}
                <table className="dlPreviewTable" style={{ width: "100%", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {onImportPreviewChange ? <th scope="col" /> : null}
                      <th>تاریخ</th>
                      <th>ستون</th>
                      <th>قلم</th>
                      <th>{unitLabel}</th>
                      <th>وضعیت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.slice(0, 40).map((row, i) => (
                      <tr
                        key={`${row.date}-${row.column}-${i}`}
                        className={
                          onImportPreviewChange
                            ? selStyles.selectableRow
                            : undefined
                        }
                        {...(onImportPreviewChange
                          ? rowSelectActivateProps({
                              onActivate: () =>
                                previewSelection.toggle(String(i)),
                            })
                          : {})}
                      >
                        {onImportPreviewChange ? (
                          <td>
                            <RowSelectCheckbox
                              checked={previewSelection.isSelected(String(i))}
                              onChange={() => previewSelection.toggle(String(i))}
                              label={`انتخاب ردیف پیش‌نمایش ${i + 1}`}
                            />
                          </td>
                        ) : null}
                        <td>
                          <input
                            value={row.date}
                            disabled={pending || !onImportPreviewChange}
                            onChange={(e) => {
                              if (!onImportPreviewChange) return;
                              const next = [...importPreview];
                              next[i] = { ...row, date: e.target.value };
                              onImportPreviewChange(next);
                            }}
                            style={{ width: "7.5rem" }}
                          />
                        </td>
                        <td>
                          <input
                            value={row.column}
                            disabled={pending || !onImportPreviewChange}
                            onChange={(e) => {
                              if (!onImportPreviewChange) return;
                              const next = [...importPreview];
                              next[i] = { ...row, column: e.target.value };
                              onImportPreviewChange(next);
                            }}
                            style={{ width: "6rem" }}
                          />
                        </td>
                        <td>
                          <input
                            value={row.itemName}
                            disabled={pending || !onImportPreviewChange}
                            onChange={(e) => {
                              if (!onImportPreviewChange) return;
                              const next = [...importPreview];
                              next[i] = { ...row, itemName: e.target.value };
                              onImportPreviewChange(next);
                            }}
                            style={{ minWidth: "6rem", width: "100%" }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min={1}
                            value={previewAmountToDisplay(row.amountToman)}
                            disabled={pending || !onImportPreviewChange}
                            onChange={(e) => {
                              if (!onImportPreviewChange) return;
                              const next = [...importPreview];
                              next[i] = {
                                ...row,
                                amountToman: displayToPreviewAmountToman(
                                  Number(e.target.value) || 1,
                                ),
                              };
                              onImportPreviewChange(next);
                            }}
                            style={{ width: "5.5rem" }}
                          />
                        </td>
                        <td>{row.resolved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {unmappedColumns.length > 0 && onColumnMapChange ? (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                <StatusLine>
                  این ستون‌ها عضو متناظر ندارند — عضو، «مشترک» یا «رد» را انتخاب کنید.
                </StatusLine>
                {unmappedColumns.map((col) => (
                  <label
                    key={col}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(6rem, 1fr) minmax(8rem, 1.4fr)",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    <span>{col}</span>
                    <select
                      value={columnMap[col] ?? ""}
                      onChange={(e) => onColumnMapChange(col, e.target.value)}
                      disabled={pending}
                    >
                      <option value="">— انتخاب —</option>
                      <option value="shared">هزینه مشترک</option>
                      <option value="skip">رد کردن ستون</option>
                      {members.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ) : null}

            {canCommit ? (
              <div style={{ marginTop: 12 }}>
                <Button
                  type="button"
                  onClick={onConfirmMappedImport}
                  disabled={pending}
                >
                  تأیید ورود به دفتر
                </Button>
              </div>
            ) : null}
          </div>
        </details>
      )}
    </>
  );
}
