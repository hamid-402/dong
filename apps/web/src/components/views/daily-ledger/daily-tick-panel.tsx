"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  CatalogFrequentItem,
  DailyLedgerDayTemplateResponse,
  DailyLedgerResponse,
  LedgerDayLineInput,
  PettyCashFundSummary,
} from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { CatalogPicker } from "@/components/catalog-picker";
import { EmptyHint, FormStack, StatusLine } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { useDisplayUnit } from "@/lib/display-unit";
import { displayInputToIrrMinor } from "@/lib/irr-money";
import { moneyFieldLabel } from "@/lib/money-labels";
import { newClientId } from "@/lib/id";
import styles from "./daily-tick-panel.module.css";

type TickShared = {
  key: string;
  catalogItemId: string;
  itemName: string;
  unitCode: string;
  unitPriceMinor: string;
  quantity: number;
  checked: boolean;
};

type TickPersonalCol = {
  catalogItemId: string;
  itemName: string;
  unitCode: string;
  unitPriceMinor: string;
};

type TickDraft = {
  shared: TickShared[];
  personalCols: TickPersonalCol[];
  /** memberUserId → catalogItemId → quantity (0/absent = none). Legacy drafts used boolean. */
  ticks: Record<string, Record<string, number | boolean>>;
  freeName: string;
  freeToman: string;
  freeQuantity?: string;
  freeMember: string;
  fundingSourceKind?: "personal" | "petty_cash";
  fundingRefId?: string;
};

type DailyTickPanelProps = {
  workspaceId: string;
  date: string;
  members: DailyLedgerResponse["members"];
  catalogEnabled: boolean;
  readOnly?: boolean;
  pending: boolean;
  /** Tighter chrome when nested under day-detail fold. */
  compact?: boolean;
  onPosted: () => void;
  onError: (message: string) => void;
};

function draftStorageKey(workspaceId: string, date: string): string {
  return `dang:ledger-tick-draft:${workspaceId}:${date}`;
}

function readDraft(workspaceId: string, date: string): TickDraft | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(workspaceId, date));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TickDraft;
    if (!Array.isArray(parsed.shared) || !Array.isArray(parsed.personalCols)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(workspaceId: string, date: string, draft: TickDraft): void {
  try {
    sessionStorage.setItem(draftStorageKey(workspaceId, date), JSON.stringify(draft));
  } catch {
    /* quota / private mode — ignore */
  }
}

function clearDraft(workspaceId: string, date: string): void {
  try {
    sessionStorage.removeItem(draftStorageKey(workspaceId, date));
  } catch {
    /* ignore */
  }
}

/** Normalize legacy boolean ticks and clamp quantities. */
function normalizeTicks(
  raw: Record<string, Record<string, number | boolean>> | undefined,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  if (!raw) return out;
  for (const [memberId, cols] of Object.entries(raw)) {
    const nextCols: Record<string, number> = {};
    for (const [catalogId, value] of Object.entries(cols ?? {})) {
      if (value === true) nextCols[catalogId] = 1;
      else if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        nextCols[catalogId] = value;
      }
    }
    if (Object.keys(nextCols).length > 0) out[memberId] = nextCols;
  }
  return out;
}

function parsePositiveQuantity(raw: string, fallback = 1): number {
  const n = Number(String(raw).replaceAll(",", "").trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 1_000_000);
}

function seedFromTemplate(data: DailyLedgerDayTemplateResponse): {
  shared: TickShared[];
  personalCols: TickPersonalCol[];
} {
  const fromFrequent = data.frequentItems.slice(0, 8);
  const fromPins = (data.pins ?? [])
    .map((p) => p.item)
    .filter((item): item is NonNullable<typeof item> => Boolean(item && item.active));
  const seedItems = uniqueById([
    ...fromPins.map((i) => ({ ...i, useCount: 0, lastUsedAt: "" })),
    ...fromFrequent,
  ]);
  return {
    shared: seedItems.slice(0, 4).map((item) => ({
      key: item.id,
      catalogItemId: item.id,
      itemName: item.name,
      unitCode: item.unitCode,
      unitPriceMinor: item.referencePriceMinor,
      quantity: 1,
      checked: false,
    })),
    personalCols: seedItems.slice(0, 6).map((item) => ({
      catalogItemId: item.id,
      itemName: item.name,
      unitCode: item.unitCode,
      unitPriceMinor: item.referencePriceMinor,
    })),
  };
}

/**
 * Tick-mode daily consumption: shared equal-split rows + personal matrix (S11-07).
 * Seeds come from catalog pins/frequent — draft is kept in session until «ثبت روز».
 */
export function DailyTickPanel({
  workspaceId,
  date,
  members,
  catalogEnabled,
  readOnly = false,
  pending,
  compact = false,
  onPosted,
  onError,
}: DailyTickPanelProps) {
  const displayUnit = useDisplayUnit();
  const [template, setTemplate] = useState<DailyLedgerDayTemplateResponse | null>(null);
  const [shared, setShared] = useState<TickShared[]>([]);
  const [personalCols, setPersonalCols] = useState<TickPersonalCol[]>([]);
  /** memberUserId → catalogItemId → quantity (>0 means selected) */
  const [ticks, setTicks] = useState<Record<string, Record<string, number>>>({});
  const [freeName, setFreeName] = useState("");
  const [freeToman, setFreeToman] = useState("");
  const [freeQuantity, setFreeQuantity] = useState("1");
  const [freeMember, setFreeMember] = useState<string>("shared");
  const [fundingSourceKind, setFundingSourceKind] = useState<"personal" | "petty_cash">(
    "personal",
  );
  const [fundingRefId, setFundingRefId] = useState("");
  const [pettyFunds, setPettyFunds] = useState<PettyCashFundSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loading, startLoad] = useTransition();
  const [submitting, startSubmit] = useTransition();
  const sharedSelection = useRowSelection(shared.map((s) => s.catalogItemId));
  const colSelection = useRowSelection(personalCols.map((c) => c.catalogItemId));

  useEffect(() => {
    if (!workspaceId) {
      setPettyFunds([]);
      return;
    }
    void api
      .listPettyCash(workspaceId)
      .then((funds) => {
        const active = funds.filter((f) => f.active);
        setPettyFunds(active);
        setFundingRefId((prev) => prev || active[0]?.id || "");
      })
      .catch(() => setPettyFunds([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !catalogEnabled || !date) {
      setTemplate(null);
      setHydrated(false);
      return;
    }
    setHydrated(false);
    startLoad(() => {
      void (async () => {
        try {
          const data = await api.getLedgerDayTemplate(workspaceId, date);
          setTemplate(data);
          const saved = readDraft(workspaceId, date);
          if (saved) {
            setShared(saved.shared);
            setPersonalCols(saved.personalCols);
            setTicks(normalizeTicks(saved.ticks));
            setFreeName(saved.freeName ?? "");
            setFreeToman(saved.freeToman ?? "");
            setFreeQuantity(saved.freeQuantity ?? "1");
            setFreeMember(saved.freeMember || "shared");
            setFundingSourceKind(saved.fundingSourceKind === "petty_cash" ? "petty_cash" : "personal");
            setFundingRefId(saved.fundingRefId ?? "");
          } else {
            const seeded = seedFromTemplate(data);
            setShared(seeded.shared);
            setPersonalCols(seeded.personalCols);
            setTicks({});
            setFreeName("");
            setFreeToman("");
            setFreeQuantity("1");
            setFreeMember("shared");
            setFundingSourceKind("personal");
            setFundingRefId("");
          }
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "بارگذاری قالب روز ناموفق"));
          setTemplate({ date, frequentItems: [], pins: [], yesterdayLines: [] });
          const saved = readDraft(workspaceId, date);
          if (saved) {
            setShared(saved.shared);
            setPersonalCols(saved.personalCols);
            setTicks(normalizeTicks(saved.ticks));
            setFreeName(saved.freeName ?? "");
            setFreeToman(saved.freeToman ?? "");
            setFreeQuantity(saved.freeQuantity ?? "1");
            setFreeMember(saved.freeMember || "shared");
            setFundingSourceKind(saved.fundingSourceKind === "petty_cash" ? "petty_cash" : "personal");
            setFundingRefId(saved.fundingRefId ?? "");
          } else {
            setShared([]);
            setPersonalCols([]);
            setTicks({});
          }
        } finally {
          setHydrated(true);
        }
      })();
    });
  }, [workspaceId, catalogEnabled, date]);

  useEffect(() => {
    if (!hydrated || !workspaceId || !date || readOnly) return;
    writeDraft(workspaceId, date, {
      shared,
      personalCols,
      ticks,
      freeName,
      freeToman,
      freeQuantity,
      freeMember,
      fundingSourceKind,
      fundingRefId,
    });
  }, [
    hydrated,
    workspaceId,
    date,
    readOnly,
    shared,
    personalCols,
    ticks,
    freeName,
    freeToman,
    freeQuantity,
    freeMember,
    fundingSourceKind,
    fundingRefId,
  ]);

  const dayTotalMinor = useMemo(() => {
    let total = 0n;
    for (const row of shared) {
      if (!row.checked) continue;
      total += BigInt(Math.round(row.quantity * Number(row.unitPriceMinor)));
    }
    for (const member of members) {
      const row = ticks[member.userId] ?? {};
      for (const col of personalCols) {
        const qty = row[col.catalogItemId] ?? 0;
        if (qty <= 0) continue;
        total += BigInt(Math.round(qty * Number(col.unitPriceMinor)));
      }
    }
    const freeUnit = displayInputToIrrMinor(freeToman, displayUnit);
    if (freeName.trim() && freeUnit) {
      const qty = parsePositiveQuantity(freeQuantity, 1);
      total += BigInt(Math.round(qty * Number(freeUnit.amountMinor)));
    }
    return total.toString();
  }, [
    shared,
    ticks,
    personalCols,
    members,
    freeName,
    freeToman,
    freeQuantity,
    displayUnit,
  ]);

  function removeShared(catalogItemId: string) {
    setShared((prev) => prev.filter((row) => row.catalogItemId !== catalogItemId));
  }

  function removeSharedSelected() {
    if (sharedSelection.selectedCount === 0) return;
    const ids = sharedSelection.selectedIds;
    const label =
      ids.length === 1
        ? "این قلم جمعی حذف شود؟"
        : `${ids.length.toLocaleString("fa-IR")} قلم جمعی حذف شوند؟`;
    if (!window.confirm(label)) return;
    for (const id of ids) removeShared(id);
    sharedSelection.clear();
  }

  function removePersonalCol(catalogItemId: string) {
    setPersonalCols((prev) => prev.filter((col) => col.catalogItemId !== catalogItemId));
    setTicks((prev) => {
      const next: Record<string, Record<string, number>> = {};
      for (const [userId, row] of Object.entries(prev)) {
        const rest = { ...row };
        delete rest[catalogItemId];
        next[userId] = rest;
      }
      return next;
    });
  }

  function removePersonalColsSelected() {
    if (colSelection.selectedCount === 0) return;
    const ids = colSelection.selectedIds;
    const label =
      ids.length === 1
        ? "این ستون فردی حذف شود؟"
        : `${ids.length.toLocaleString("fa-IR")} ستون فردی حذف شوند؟`;
    if (!window.confirm(label)) return;
    for (const id of ids) removePersonalCol(id);
    colSelection.clear();
  }

  function reloadSuggestions() {
    if (!template) return;
    const seeded = seedFromTemplate(template);
    setShared(seeded.shared);
    setPersonalCols(seeded.personalCols);
    setTicks({});
  }

  function submitDay() {
    if (readOnly || !workspaceId) return;
    if (fundingSourceKind === "petty_cash" && !fundingRefId.trim()) {
      onError("برای خرج از تنخواه، صندوق را انتخاب کنید");
      return;
    }
    const fundingFields =
      fundingSourceKind === "petty_cash" && fundingRefId.trim()
        ? {
            fundingSourceKind: "petty_cash" as const,
            fundingRefId: fundingRefId.trim(),
          }
        : { fundingSourceKind: "personal" as const };
    const lines: LedgerDayLineInput[] = [];

    for (const row of shared) {
      if (!row.checked) continue;
      const amountMinor = String(Math.round(row.quantity * Number(row.unitPriceMinor)));
      lines.push({
        itemName: row.itemName,
        amount: { amountMinor, currency: "IRR" },
        memberUserId: null,
        catalogItemId: row.catalogItemId,
        unitCode: row.unitCode,
        quantity: row.quantity,
        unitPriceMinor: row.unitPriceMinor,
        ...fundingFields,
      });
    }

    for (const member of members) {
      const row = ticks[member.userId] ?? {};
      for (const col of personalCols) {
        const qty = row[col.catalogItemId] ?? 0;
        if (qty <= 0) continue;
        const amountMinor = String(Math.round(qty * Number(col.unitPriceMinor)));
        lines.push({
          itemName: col.itemName,
          amount: { amountMinor, currency: "IRR" },
          memberUserId: member.userId,
          catalogItemId: col.catalogItemId,
          unitCode: col.unitCode,
          quantity: qty,
          unitPriceMinor: col.unitPriceMinor,
          ...fundingFields,
        });
      }
    }

    if (freeName.trim() && freeToman.trim()) {
      const freeUnit = displayInputToIrrMinor(freeToman, displayUnit);
      if (freeUnit) {
        const qty = parsePositiveQuantity(freeQuantity, 1);
        const amountMinor = String(Math.round(qty * Number(freeUnit.amountMinor)));
        lines.push({
          itemName: freeName.trim(),
          amount: { amountMinor, currency: "IRR" },
          memberUserId: freeMember === "shared" ? null : freeMember,
          quantity: qty,
          unitPriceMinor: freeUnit.amountMinor,
          ...fundingFields,
        });
      }
    }

    if (lines.length === 0) {
      onError("حداقل یک قلم تیک‌خورده یا تایپ‌آزاد لازم است");
      return;
    }

    startSubmit(() => {
      void (async () => {
        try {
          await api.postLedgerDay(workspaceId, {
            date,
            idempotencyKey: newClientId(),
            lines,
          });
          clearDraft(workspaceId, date);
          setFreeName("");
          setFreeToman("");
          setFreeQuantity("1");
          setTicks({});
          setShared((prev) => prev.map((row) => ({ ...row, checked: false, quantity: 1 })));
          onPosted();
        } catch (err: unknown) {
          onError(friendlyErrorMessage(err, "ثبت روز ناموفق"));
        }
      })();
    });
  }

  if (!catalogEnabled) return null;

  return (
    <section
      className={compact ? `${styles.root} ${styles.compact}` : styles.root}
      aria-label="ثبت سریع مصرف روزانه"
    >
      <header className={styles.header}>
        <div>
          <h3 className={styles.title}>تیک روزانه</h3>
          <StatusLine>
            {loading
              ? "بارگذاری قالب…"
              : template && template.frequentItems.length === 0 && personalCols.length === 0
                ? "پرکاربردی ثبت نشده — از کاتالوگ یا تایپ آزاد استفاده کنید"
                : "پیشنهاد از سنجاق/پرکاربرد کاتالوگ · تا ثبت روز پیش‌نویس نگه داشته می‌شود"}
          </StatusLine>
        </div>
        {!readOnly && template ? (
          <button type="button" className={styles.quietBtn} onClick={reloadSuggestions}>
            بازنشانی پیشنهادها
          </button>
        ) : null}
      </header>

      <div className={styles.shared}>
        <h4 className={styles.sectionTitle}>جمعی (تقسیم مساوی)</h4>
        {shared.length === 0 ? <EmptyHint>قلمی برای تیک جمعی نیست.</EmptyHint> : null}
        {!readOnly && shared.length > 0 ? (
          <SelectionActionBar
            selectedCount={sharedSelection.selectedCount}
            idleHint="روی ردیف کلیک کنید یا مربع انتخاب کنارش را تیک بزنید (جدا از تیک مصرف)"
            onClear={sharedSelection.clear}
          >
            <button
              type="button"
              className={selStyles.danger}
              disabled={sharedSelection.selectedCount === 0 || pending || submitting}
              onClick={removeSharedSelected}
            >
              حذف
            </button>
          </SelectionActionBar>
        ) : null}
        <ul className={styles.sharedList}>
          {shared.map((row, index) => (
            <li
              key={row.key}
              className={`${styles.sharedRow}${!readOnly ? ` ${selStyles.selectableRow}` : ""}`}
              {...(!readOnly
                ? rowSelectActivateProps({
                    onActivate: () =>
                      sharedSelection.toggle(row.catalogItemId),
                  })
                : {})}
            >
              {!readOnly ? (
                <RowSelectCheckbox
                  checked={sharedSelection.isSelected(row.catalogItemId)}
                  onChange={() => sharedSelection.toggle(row.catalogItemId)}
                  label={`انتخاب برای حذف ${row.itemName}`}
                />
              ) : null}
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={readOnly || pending || submitting}
                  onChange={() => {
                    const next = shared.slice();
                    next[index] = { ...row, checked: !row.checked };
                    setShared(next);
                  }}
                />
                <span>{row.itemName}</span>
              </label>
              <div className={styles.qtyGroup}>
                <button
                  type="button"
                  className={styles.qty}
                  disabled={readOnly || !row.checked || row.quantity <= 1}
                  aria-label={`کم کردن تعداد ${row.itemName}`}
                  onClick={() => {
                    const next = shared.slice();
                    next[index] = {
                      ...row,
                      quantity: Math.max(1, row.quantity - 1),
                    };
                    setShared(next);
                  }}
                >
                  −
                </button>
                <input
                  type="number"
                  className={styles.qtyInput}
                  min={1}
                  step="any"
                  disabled={readOnly || !row.checked}
                  aria-label={`تعداد ${row.itemName}`}
                  value={row.quantity}
                  onChange={(e) => {
                    const next = shared.slice();
                    next[index] = {
                      ...row,
                      quantity: parsePositiveQuantity(e.target.value, 1),
                    };
                    setShared(next);
                  }}
                />
                <button
                  type="button"
                  className={styles.qty}
                  disabled={readOnly || !row.checked}
                  aria-label={`افزایش تعداد ${row.itemName}`}
                  onClick={() => {
                    const next = shared.slice();
                    next[index] = { ...row, quantity: row.quantity + 1 };
                    setShared(next);
                  }}
                >
                  +
                </button>
                <span className={styles.unitHint}>{row.unitCode}</span>
              </div>
              <Amount
                irrMinor={String(Math.round(row.quantity * Number(row.unitPriceMinor)))}
              />
            </li>
          ))}
        </ul>
        {!readOnly ? (
          <CatalogPicker
            workspaceId={workspaceId}
            enabled={catalogEnabled}
            label="افزودن قلم جمعی از کاتالوگ"
            onSelect={(sel) => {
              if (shared.some((s) => s.catalogItemId === sel.catalogItemId)) return;
              setShared([
                ...shared,
                {
                  key: sel.catalogItemId,
                  catalogItemId: sel.catalogItemId,
                  itemName: sel.title,
                  unitCode: sel.unitCode,
                  unitPriceMinor: sel.unitPriceMinor,
                  quantity: 1,
                  checked: true,
                },
              ]);
            }}
          />
        ) : null}
      </div>

      <div className={styles.personal}>
        <h4 className={styles.sectionTitle}>فردی (هر کس مال خودش)</h4>
        {personalCols.length === 0 || members.length === 0 ? (
          <EmptyHint>برای ماتریس فردی، یک قلم از کاتالوگ اضافه کنید.</EmptyHint>
        ) : (
          <div className={styles.matrixWrap}>
            <p className={styles.matrixHint}>
              در هر خانه تعداد بزنید (خالی یا ۰ = بدون مصرف).
            </p>
            {!readOnly ? (
              <SelectionActionBar
                selectedCount={colSelection.selectedCount}
                idleHint="روی عنوان ستون کلیک کنید یا مربع کنارش را تیک بزنید"
                onClear={colSelection.clear}
              >
                <button
                  type="button"
                  className={selStyles.danger}
                  disabled={colSelection.selectedCount === 0 || pending || submitting}
                  onClick={removePersonalColsSelected}
                >
                  حذف ستون
                </button>
              </SelectionActionBar>
            ) : null}
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th scope="col">عضو</th>
                  {personalCols.map((col) => (
                    <th
                      key={col.catalogItemId}
                      scope="col"
                      className={!readOnly ? selStyles.selectableRow : undefined}
                      {...(!readOnly
                        ? rowSelectActivateProps({
                            onActivate: () =>
                              colSelection.toggle(col.catalogItemId),
                          })
                        : {})}
                    >
                      <span className={styles.colHead}>
                        {!readOnly ? (
                          <RowSelectCheckbox
                            checked={colSelection.isSelected(col.catalogItemId)}
                            onChange={() => colSelection.toggle(col.catalogItemId)}
                            label={`انتخاب ستون ${col.itemName}`}
                          />
                        ) : null}
                        <span>{col.itemName}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId}>
                    <th scope="row">{member.displayName}</th>
                    {personalCols.map((col) => {
                      const qty = ticks[member.userId]?.[col.catalogItemId] ?? 0;
                      return (
                        <td key={col.catalogItemId}>
                          <input
                            type="number"
                            className={styles.qtyInput}
                            min={0}
                            step="any"
                            aria-label={`${member.displayName} · ${col.itemName} · تعداد`}
                            value={qty || ""}
                            placeholder="0"
                            disabled={readOnly || pending || submitting}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              const nextQty =
                                raw === ""
                                  ? 0
                                  : parsePositiveQuantity(raw, 0);
                              setTicks((prev) => {
                                const memberRow = {
                                  ...(prev[member.userId] ?? {}),
                                };
                                if (nextQty <= 0) delete memberRow[col.catalogItemId];
                                else memberRow[col.catalogItemId] = nextQty;
                                return {
                                  ...prev,
                                  [member.userId]: memberRow,
                                };
                              });
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!readOnly ? (
          <CatalogPicker
            workspaceId={workspaceId}
            enabled={catalogEnabled}
            label="افزودن ستون فردی از کاتالوگ"
            onSelect={(sel) => {
              if (personalCols.some((c) => c.catalogItemId === sel.catalogItemId)) return;
              setPersonalCols([
                ...personalCols,
                {
                  catalogItemId: sel.catalogItemId,
                  itemName: sel.title,
                  unitCode: sel.unitCode,
                  unitPriceMinor: sel.unitPriceMinor,
                },
              ]);
            }}
          />
        ) : null}
      </div>

      {!readOnly ? (
        <details className={styles.freeText}>
          <summary>افزودن قلم دیگر (تایپ آزاد)</summary>
          <FormStack density="compact">
            <TextField
              label="نام"
              value={freeName}
              onChange={(e) => setFreeName(e.target.value)}
            />
            <TextField
              label="تعداد"
              inputMode="decimal"
              value={freeQuantity}
              onChange={(e) => setFreeQuantity(e.target.value)}
              placeholder="1"
            />
            <TextField
              label={moneyFieldLabel("مبلغ واحد", displayUnit)}
              value={freeToman}
              onChange={(e) => setFreeToman(e.target.value)}
            />
            <label className={styles.freeMember}>
              ستون
              <select value={freeMember} onChange={(e) => setFreeMember(e.target.value)}>
                <option value="shared">هزینه مشترک</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          </FormStack>
        </details>
      ) : null}

      {!readOnly ? (
        <div className={styles.funding}>
          <SelectField
            label="منبع پرداخت همهٔ قلم‌های این تیک"
            value={
              fundingSourceKind === "petty_cash" && fundingRefId
                ? `petty:${fundingRefId}`
                : "personal"
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v.startsWith("petty:")) {
                setFundingSourceKind("petty_cash");
                setFundingRefId(v.slice("petty:".length));
              } else {
                setFundingSourceKind("personal");
                setFundingRefId("");
              }
            }}
          >
            <option value="personal">حساب شخصی پرداخت‌کننده</option>
            {pettyFunds.map((f) => (
              <option key={f.id} value={`petty:${f.id}`}>
                صندوق تنخواه · {f.name}
              </option>
            ))}
          </SelectField>
          <StatusLine>
            {fundingSourceKind === "petty_cash"
              ? "قلم‌های امروز از صندوق کم می‌شوند."
              : "قلم‌های امروز از جیب شخصی ثبت می‌شوند."}
          </StatusLine>
        </div>
      ) : null}

      <footer className={styles.footer}>
        <span>
          جمع امروز: <Amount irrMinor={dayTotalMinor === "0" ? "0" : dayTotalMinor} />
        </span>
        <Button
          type="button"
          disabled={readOnly || pending || submitting || dayTotalMinor === "0"}
          onClick={submitDay}
        >
          ثبت روز
        </Button>
      </footer>
    </section>
  );
}

function uniqueById(items: CatalogFrequentItem[]): CatalogFrequentItem[] {
  const seen = new Set<string>();
  const out: CatalogFrequentItem[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
