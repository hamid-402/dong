"use client";

import { newClientId } from "@/lib/id";

import { useMemo } from "react";
import type {
  ExpenseItemInput,
  ExpenseSplitLine,
  ExpenseVisibility,
  MembershipSummary,
  SplitMethod,
} from "@dang/contracts";
import { allocateExpenseSplit, allocateItemizedSplit } from "@dang/contracts";
import { Amount, Button, SelectField, TextField } from "@dang/ui";
import { DataList, DataRow, EmptyHint, FormStack } from "@/components/ui-blocks";
import {
  RowSelectCheckbox,
  SelectionActionBar,
  rowSelectActivateProps,
} from "@/components/selection/selection-action-bar";
import { useRowSelection } from "@/components/selection/use-row-selection";
import selStyles from "@/components/selection/selection-action-bar.module.css";
import { CatalogPicker } from "@/components/catalog-picker";

export type SplitComposerValue = {
  splitMethod: SplitMethod;
  participantUserIds: string[];
  /** Toman strings keyed by userId for amount/percent/shares entry. */
  lineInputs: Record<string, string>;
  visibility: ExpenseVisibility;
  /** Who paid cash for a shared expense; omit/empty → current user at submit. */
  paidByUserId?: string;
  /**
   * When true, several members paid parts of the total (paymentLines).
   * Amounts in `payerInputs` are تومان and must sum to the expense total.
   */
  multiPayer?: boolean;
  /** Toman paid by each member when multiPayer is on. */
  payerInputs?: Record<string, string>;
  /** Itemized receipt lines (toman amounts in UI). */
  items: Array<{
    key: string;
    title: string;
    toman: string;
    assigneeUserIds: string[];
    catalogItemId?: string;
    unitCode?: string;
    quantity?: number;
    unitPriceMinor?: string;
  }>;
  tipToman: string;
  taxToman: string;
  discountToman: string;
  /** G08 #29 — used when splitMethod is formula (server resolves weights from subunits). */
  formulaBasis?: "area" | "occupancy";
};

type Props = {
  members: MembershipSummary[];
  totalToman: string;
  value: SplitComposerValue;
  onChange: (next: SplitComposerValue) => void;
  supportsCompany?: boolean;
  personalOnly?: boolean;
  currentUserId?: string;
  /** مادرخرج / مدیر مالی — می‌تواند خرج خصوصی عضو دیگر را ثبت کند. */
  canAssignPrivateToOthers?: boolean;
  /** When true, hide total field dependency for itemized (total derived). */
  onDerivedTotalToman?: (toman: string) => void;
  /** Workspace for catalog picker (S11-07); omit to hide picker. */
  workspaceId?: string;
  catalogEnabled?: boolean;
  /** Named split presets (G04 #7). */
  splitPresets?: Array<{
    id: string;
    name: string;
    splitMethod: SplitMethod;
    lines: Array<{ userId: string; shares?: number; percentBp?: number; amountMinor?: string }>;
  }>;
  /** Persist current split as a named preset (shares/percent/amount/equal). */
  onSavePreset?: (name: string) => void;
  savePresetPending?: boolean;
  /** Show formula (area/occupancy) — building spaces (G08 #29). */
  allowFormula?: boolean;
};

function tomanToMinor(toman: string): string | null {
  const n = Number(toman.replaceAll(",", ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return String(Math.round(n) * 10);
}

export function emptySplitComposer(visibility: ExpenseVisibility = "shared"): SplitComposerValue {
  return {
    splitMethod: "equal",
    participantUserIds: [],
    lineInputs: {},
    visibility,
    multiPayer: false,
    payerInputs: {},
    items: [],
    tipToman: "",
    taxToman: "",
    discountToman: "",
  };
}

/** Prefill composer from an existing expense (revise flow). */
export function splitComposerFromExpense(
  expense: {
    visibility?: ExpenseVisibility;
    participantUserIds: string[];
    paidByUserId: string;
    splitMethod: SplitMethod;
    paymentLines?: Array<{ userId: string; amount: { amountMinor: string } }>;
    splits: Array<{
      userId: string;
      amount: { amountMinor: string };
      percent?: string;
      shares?: number;
    }>;
    items?: Array<{
      title: string;
      amount: { amountMinor: string };
      assigneeUserIds: string[];
      catalogItemId?: string;
      unitCode?: string;
      quantity?: number;
      unitPriceMinor?: string;
    }>;
    tip?: { amountMinor: string };
    tax?: { amountMinor: string };
    discount?: { amountMinor: string };
  },
  minorToToman: (amountMinor: string) => string,
): SplitComposerValue {
  const next = emptySplitComposer(expense.visibility ?? "shared");
  next.participantUserIds = [...expense.participantUserIds];
  next.paidByUserId = expense.paidByUserId;
  next.splitMethod =
    expense.splitMethod === "itemized" ||
    expense.splitMethod === "amount" ||
    expense.splitMethod === "percent" ||
    expense.splitMethod === "shares"
      ? expense.splitMethod
      : "equal";
  if (expense.paymentLines && expense.paymentLines.length > 1) {
    next.multiPayer = true;
    next.payerInputs = Object.fromEntries(
      expense.paymentLines.map((line) => [
        line.userId,
        minorToToman(line.amount.amountMinor),
      ]),
    );
  }
  if (
    (next.splitMethod === "amount" ||
      next.splitMethod === "percent" ||
      next.splitMethod === "shares") &&
    expense.splits.length > 0
  ) {
    next.lineInputs = Object.fromEntries(
      expense.splits.map((line) => {
        if (next.splitMethod === "amount") {
          return [line.userId, minorToToman(line.amount.amountMinor)];
        }
        if (next.splitMethod === "percent" && line.percent) {
          return [line.userId, String(Number(line.percent) / 100)];
        }
        return [line.userId, String(line.shares ?? 1)];
      }),
    );
  }
  if (next.splitMethod === "itemized" && expense.items?.length) {
    next.items = expense.items.map((item) => ({
      key: newClientId(),
      title: item.title,
      toman: minorToToman(item.amount.amountMinor),
      assigneeUserIds: [...item.assigneeUserIds],
      catalogItemId: item.catalogItemId,
      unitCode: item.unitCode,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    }));
    next.participantUserIds = [
      ...new Set(expense.items.flatMap((item) => item.assigneeUserIds)),
    ];
  }
  if (expense.tip) next.tipToman = minorToToman(expense.tip.amountMinor);
  if (expense.tax) next.taxToman = minorToToman(expense.tax.amountMinor);
  if (expense.discount) next.discountToman = minorToToman(expense.discount.amountMinor);
  return next;
}

function buildItemInputs(value: SplitComposerValue): ExpenseItemInput[] {
  return value.items
    .filter((item) => item.title.trim() && item.assigneeUserIds.length > 0)
    .map((item) => {
      const qty = item.quantity;
      const unitPrice = item.unitPriceMinor;
      const amountMinor =
        qty != null && unitPrice
          ? String(Math.round(qty * Number(unitPrice)))
          : (tomanToMinor(item.toman) ?? "0");
      return {
        title: item.title.trim(),
        amount: {
          amountMinor,
          currency: "IRR" as const,
        },
        assigneeUserIds: item.assigneeUserIds,
        catalogItemId: item.catalogItemId,
        unitCode: item.unitCode,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
      };
    });
}

/** UX split composer: equal / amount / itemized (+ percent/shares). */
export function SplitComposer({
  members,
  totalToman,
  value,
  onChange,
  supportsCompany = false,
  personalOnly = false,
  currentUserId,
  canAssignPrivateToOthers = false,
  onDerivedTotalToman,
  workspaceId,
  catalogEnabled = false,
  splitPresets = [],
  onSavePreset,
  savePresetPending = false,
  allowFormula = false,
}: Props) {
  const itemIds = useMemo(() => value.items.map((item) => item.key), [value.items]);
  const itemSelection = useRowSelection(itemIds);
  const preview = useMemo(() => {
    try {
      if (value.splitMethod === "formula") {
        /* Weights resolved server-side from subunit area/occupancy. */
        return [] as ExpenseSplitLine[];
      }
      if (value.splitMethod === "itemized") {
        const items = buildItemInputs(value);
        if (items.length === 0) return [] as ExpenseSplitLine[];
        const tipMinor = tomanToMinor(value.tipToman);
        const taxMinor = tomanToMinor(value.taxToman);
        const discountMinor = tomanToMinor(value.discountToman);
        const result = allocateItemizedSplit({
          items,
          tip: tipMinor && tipMinor !== "0" ? { amountMinor: tipMinor, currency: "IRR" } : undefined,
          tax: taxMinor && taxMinor !== "0" ? { amountMinor: taxMinor, currency: "IRR" } : undefined,
          discount:
            discountMinor && discountMinor !== "0"
              ? { amountMinor: discountMinor, currency: "IRR" }
              : undefined,
        });
        const toman = String(Number(result.total.amountMinor) / 10);
        onDerivedTotalToman?.(toman);
        return result.splits;
      }

      const minor = tomanToMinor(totalToman);
      if (!minor || Number(minor) <= 0 || value.participantUserIds.length === 0) {
        return [] as ExpenseSplitLine[];
      }
      const splitLines =
        value.splitMethod === "equal"
          ? undefined
          : value.participantUserIds.map((userId) => {
              const raw = value.lineInputs[userId] ?? "";
              if (value.splitMethod === "amount") {
                const lineMinor = tomanToMinor(raw) ?? "0";
                return {
                  userId,
                  amount: { amountMinor: lineMinor, currency: "IRR" as const },
                };
              }
              if (value.splitMethod === "percent") {
                return {
                  userId,
                  amount: { amountMinor: "0", currency: "IRR" as const },
                  percent: String(Math.round(Number(raw || "0") * 100)),
                };
              }
              const defaultShare =
                members.find((m) => m.userId === userId)?.defaultShares ?? 1;
              return {
                userId,
                amount: { amountMinor: "0", currency: "IRR" as const },
                shares: Math.max(1, Math.round(Number(raw || String(defaultShare)))),
              };
            });
      return allocateExpenseSplit({
        total: { amountMinor: minor, currency: "IRR" },
        splitMethod: value.splitMethod,
        participantUserIds: value.participantUserIds,
        splitLines,
      });
    } catch {
      return [];
    }
  }, [totalToman, value, members, onDerivedTotalToman]);

  function toggleParticipant(userId: string) {
    if (value.visibility === "private" && !canAssignPrivateToOthers) return;
    if (value.visibility === "private" && canAssignPrivateToOthers) {
      onChange({ ...value, participantUserIds: [userId] });
      return;
    }
    const exists = value.participantUserIds.includes(userId);
    const participantUserIds = exists
      ? value.participantUserIds.filter((id) => id !== userId)
      : [...value.participantUserIds, userId];
    onChange({ ...value, participantUserIds });
  }

  function setVisibility(visibility: ExpenseVisibility) {
    if (visibility === "private") {
      const me =
        currentUserId && members.some((m) => m.userId === currentUserId)
          ? currentUserId
          : members[0]?.userId;
      onChange({
        ...value,
        visibility,
        splitMethod: "equal",
        participantUserIds: me ? [me] : value.participantUserIds.slice(0, 1),
        paidByUserId: undefined,
      });
      return;
    }
    onChange({
      ...value,
      visibility,
      participantUserIds:
        value.participantUserIds.length > 0
          ? value.participantUserIds
          : members.map((m) => m.userId),
    });
  }

  function addItem() {
    onChange({
      ...value,
      splitMethod: "itemized",
      items: [
        ...value.items,
        {
          key: newClientId(),
          title: "",
          toman: "",
          assigneeUserIds: members.map((m) => m.userId),
        },
      ],
    });
  }

  const memberLabel = (userId: string) =>
    members.find((m) => m.userId === userId)?.displayName ?? userId.slice(0, 8);

  const effectivePayerId = value.paidByUserId || currentUserId || "";
  const payerName =
    (effectivePayerId && members.find((m) => m.userId === effectivePayerId)?.displayName) ||
    "شما";
  const payerInputs = value.payerInputs ?? {};
  const multiPayerSumToman = Object.values(payerInputs).reduce((sum, raw) => {
    const n = Number(String(raw).replaceAll(",", ""));
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
  const totalTomanNum = Number(String(totalToman).replaceAll(",", ""));
  const multiPayerSumOk =
    Number.isFinite(totalTomanNum) &&
    totalTomanNum > 0 &&
    Math.round(multiPayerSumToman) === Math.round(totalTomanNum);

  return (
    <div className="splitComposer">
      {!personalOnly && (value.visibility === "shared" || value.visibility === "company") ? (
        <div className="splitComposer__payer">
          <label className="splitComposer__multiToggle">
            <input
              type="checkbox"
              checked={Boolean(value.multiPayer)}
              onChange={(event) => {
                const on = event.target.checked;
                if (!on) {
                  onChange({
                    ...value,
                    multiPayer: false,
                    payerInputs: {},
                  });
                  return;
                }
                const seedId = effectivePayerId || currentUserId || members[0]?.userId;
                onChange({
                  ...value,
                  multiPayer: true,
                  payerInputs:
                    seedId && totalToman.trim()
                      ? { [seedId]: totalToman }
                      : seedId
                        ? { [seedId]: "" }
                        : {},
                });
              }}
            />
            چند نفر پول داده‌اند (تقسیم پرداخت)
          </label>
          {value.multiPayer ? (
            <>
              <p className="liveHint">
                مبلغ پرداخت هر نفر را به تومان وارد کنید؛ جمع باید با کل خرج یکی باشد
                {Number.isFinite(totalTomanNum) && totalTomanNum > 0
                  ? ` (جمع الان: ${Math.round(multiPayerSumToman).toLocaleString("fa-IR")} از ${Math.round(totalTomanNum).toLocaleString("fa-IR")})`
                  : ""}
                .
              </p>
              <DataList>
                {members.map((member) => {
                  const paid = payerInputs[member.userId] ?? "";
                  const active = paid.trim() !== "" && Number(paid.replaceAll(",", "")) > 0;
                  return (
                    <DataRow
                      key={member.userId}
                      title={
                        member.userId === currentUserId
                          ? `${member.displayName} (شما)`
                          : member.displayName
                      }
                      meta={active ? "پرداخت‌کننده" : undefined}
                      trailing={
                        <TextField
                          label="مبلغ پرداخت (تومان)"
                          value={paid}
                          onChange={(event) =>
                            onChange({
                              ...value,
                              multiPayer: true,
                              payerInputs: {
                                ...payerInputs,
                                [member.userId]: event.target.value,
                              },
                            })
                          }
                        />
                      }
                    />
                  );
                })}
              </DataList>
              {!multiPayerSumOk && totalToman.trim() ? (
                <p className="warn liveHint" role="status">
                  جمع پرداخت‌ها هنوز با مبلغ کل خرج برابر نیست.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <SelectField
                label="چه کسی پول را داده؟"
                value={effectivePayerId}
                onChange={(event) =>
                  onChange({
                    ...value,
                    paidByUserId: event.target.value || undefined,
                  })
                }
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.userId === currentUserId
                      ? `${member.displayName} (شما)`
                      : member.displayName}
                  </option>
                ))}
              </SelectField>
              <span>
                طلبکار همان کسی است که پول را داده؛ سهم مصرف در پیش‌نمایش مشخص می‌شود تا بعداً
                تأیید و تسویه کنند.
              </span>
            </>
          )}
        </div>
      ) : null}

      {!personalOnly ? (
        <SelectField
          label="نوع خرج"
          value={value.visibility}
          onChange={(event) => setVisibility(event.target.value as ExpenseVisibility)}
        >
          <option value="shared">جمعی گروه — وارد مانده می‌شود (مناسب مادرخرج)</option>
          <option value="private">
            {canAssignPrivateToOthers
              ? "خصوصی عضو — فقط همان عضو و مدیر مالی می‌بینند"
              : "خصوصی من — فقط خودم می‌بینم"}
          </option>
          {supportsCompany ? (
            <option value="company">جاری شرکت — هزینه عملیاتی تیم</option>
          ) : null}
        </SelectField>
      ) : null}

      {value.visibility !== "private" && splitPresets.length > 0 ? (
        <SelectField
          label="قالب سهم ذخیره‌شده"
          value=""
          onChange={(event) => {
            const preset = splitPresets.find((p) => p.id === event.target.value);
            if (!preset) return;
            const lineInputs: Record<string, string> = {};
            for (const line of preset.lines) {
              if (preset.splitMethod === "shares") {
                lineInputs[line.userId] = String(line.shares ?? 1);
              } else if (preset.splitMethod === "percent" && line.percentBp != null) {
                lineInputs[line.userId] = String(line.percentBp / 100);
              } else if (preset.splitMethod === "amount" && line.amountMinor) {
                lineInputs[line.userId] = String(Math.round(Number(line.amountMinor) / 10));
              }
            }
            onChange({
              ...value,
              splitMethod: preset.splitMethod,
              participantUserIds: preset.lines.map((l) => l.userId),
              lineInputs,
            });
          }}
        >
          <option value="">انتخاب قالب…</option>
          {splitPresets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      {value.visibility !== "private" &&
      onSavePreset &&
      value.splitMethod !== "itemized" &&
      value.participantUserIds.length > 0 ? (
        <Button
          type="button"
          variant="ghost"
          disabled={savePresetPending}
          onClick={() => {
            const name = window.prompt("نام قالب سهم:");
            if (!name?.trim()) return;
            onSavePreset(name.trim());
          }}
        >
          ذخیره تقسیم فعلی به‌عنوان قالب
        </Button>
      ) : null}

      {value.visibility !== "private" ? (
        <SelectField
          label="چطور بین اعضا تقسیم شود؟"
          value={value.splitMethod}
          onChange={(event) =>
            onChange({ ...value, splitMethod: event.target.value as SplitMethod })
          }
        >
          <option value="equal">مساوی (مثل بستنی برای همه)</option>
          <option value="amount">مبلغ جدا برای هر نفر</option>
          <option value="itemized">فاکتور خط‌به‌خط (هر کالا برای چه کسی)</option>
          <option value="percent">درصدی</option>
          <option value="shares">نسبت سهمی (خانواده)</option>
          {allowFormula ? (
            <option value="formula">فرمول ساختمان (متراژ / نفر)</option>
          ) : null}
        </SelectField>
      ) : null}

      {value.visibility !== "private" && value.splitMethod === "formula" ? (
        <SelectField
          label="پایهٔ فرمول"
          value={value.formulaBasis ?? "area"}
          onChange={(event) =>
            onChange({
              ...value,
              formulaBasis: event.target.value as "area" | "occupancy",
            })
          }
        >
          <option value="area">متراژ واحد (areaSqm)</option>
          <option value="occupancy">تعداد نفر واحد (occupancy)</option>
        </SelectField>
      ) : null}

      {value.visibility !== "private" && value.splitMethod === "formula" ? (
        <p className="liveHint">
          سهم هر نفر از متراژ یا تعداد نفر واحدهایی که عضو آن‌هاست محاسبه می‌شود — واحدها باید
          متراژ/نفر داشته باشند.
        </p>
      ) : null}

      {value.visibility !== "private" &&
      value.splitMethod !== "itemized" &&
      members.some((m) => (m.defaultShares ?? 1) !== 1) ? (
        <p className="liveHint">
          بعضی اعضا سهم پیش‌فرض غیر از ۱ دارند.{" "}
          <button
            type="button"
            className="linkish"
            style={{
              background: "none",
              border: 0,
              padding: 0,
              color: "var(--accent, #0b6)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
            onClick={() => {
              const participantUserIds =
                value.participantUserIds.length > 0
                  ? value.participantUserIds
                  : members.map((m) => m.userId);
              const lineInputs: Record<string, string> = {};
              for (const id of participantUserIds) {
                const member = members.find((m) => m.userId === id);
                lineInputs[id] = String(member?.defaultShares ?? 1);
              }
              onChange({
                ...value,
                splitMethod: "shares",
                participantUserIds,
                lineInputs,
              });
            }}
          >
            اعمال سهم پیش‌فرض
          </button>
        </p>
      ) : null}

      {value.visibility !== "private" && value.splitMethod === "itemized" ? (
        <div className="splitComposer">
          <p className="liveHint">هر خط سفارش را به نفر(ها) تخصیص دهید — آیتم مشترک = چند نفر</p>
          {workspaceId && catalogEnabled ? (
            <CatalogPicker
              workspaceId={workspaceId}
              enabled={catalogEnabled}
              label="افزودن از کاتالوگ"
              onSelect={(sel) => {
                onChange({
                  ...value,
                  splitMethod: "itemized",
                  items: [
                    ...value.items,
                    {
                      key: newClientId(),
                      title: sel.title,
                      toman: String(Number(sel.amountMinor) / 10),
                      assigneeUserIds: members.map((m) => m.userId),
                      catalogItemId: sel.catalogItemId,
                      unitCode: sel.unitCode,
                      quantity: sel.quantity,
                      unitPriceMinor: sel.unitPriceMinor,
                    },
                  ],
                });
              }}
            />
          ) : null}
          {value.items.length > 1 ? (
            <SelectionActionBar
              selectedCount={itemSelection.selectedCount}
              idleHint="روی ردیف کلیک کنید یا مربع کنار آیتم را تیک بزنید"
              onClear={itemSelection.clear}
            >
              <button
                type="button"
                className={selStyles.danger}
                disabled={itemSelection.selectedCount === 0}
                onClick={() => {
                  const ids = new Set(itemSelection.selectedIds);
                  const label =
                    ids.size === 1
                      ? "این آیتم حذف شود؟"
                      : `${ids.size.toLocaleString("fa-IR")} آیتم حذف شوند؟`;
                  if (!window.confirm(label)) return;
                  onChange({
                    ...value,
                    items: value.items.filter((row) => !ids.has(row.key)),
                  });
                  itemSelection.clear();
                }}
              >
                حذف آیتم
              </button>
            </SelectionActionBar>
          ) : null}
          {value.items.map((item, index) => (
            <fieldset
              key={item.key}
              className={`splitComposer__fieldset${
                value.items.length > 1 ? ` ${selStyles.selectableRow}` : ""
              }`}
              {...(value.items.length > 1
                ? rowSelectActivateProps({
                    onActivate: () => itemSelection.toggle(item.key),
                  })
                : {})}
            >
              <legend className="splitComposer__legend">
                {value.items.length > 1 ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <RowSelectCheckbox
                      checked={itemSelection.isSelected(item.key)}
                      onChange={() => itemSelection.toggle(item.key)}
                      label={`انتخاب آیتم ${index + 1}`}
                    />
                    آیتم {index + 1}
                  </span>
                ) : (
                  <>آیتم {index + 1}</>
                )}
              </legend>
              <FormStack density="compact">
                <TextField
                  label="عنوان"
                  value={item.title}
                  onChange={(event) => {
                    const items = value.items.slice();
                    items[index] = {
                      ...item,
                      title: event.target.value,
                      catalogItemId: undefined,
                    };
                    onChange({ ...value, items });
                  }}
                />
                {item.catalogItemId ? (
                  <p className="liveHint">
                    کاتالوگ · {item.unitCode ?? "—"} · تعداد{" "}
                    <button
                      type="button"
                      className="linkish"
                      onClick={() => {
                        const nextQty = Math.max(1, (item.quantity ?? 1) + 1);
                        const unitPrice = item.unitPriceMinor ?? "0";
                        const amountMinor = String(Math.round(nextQty * Number(unitPrice)));
                        const items = value.items.slice();
                        items[index] = {
                          ...item,
                          quantity: nextQty,
                          toman: String(Number(amountMinor) / 10),
                        };
                        onChange({ ...value, items });
                      }}
                    >
                      {item.quantity ?? 1}
                    </button>
                  </p>
                ) : null}
                <TextField
                  label="مبلغ (تومان)"
                  value={item.toman}
                  onChange={(event) => {
                    const items = value.items.slice();
                    items[index] = { ...item, toman: event.target.value };
                    onChange({ ...value, items });
                  }}
                />
                <div className="formStack formStack--compact">
                  {members.map((member) => (
                    <label key={member.userId} className="splitComposer__check">
                      <input
                        type="checkbox"
                        checked={item.assigneeUserIds.includes(member.userId)}
                        onChange={() => {
                          const has = item.assigneeUserIds.includes(member.userId);
                          const assigneeUserIds = has
                            ? item.assigneeUserIds.filter((id) => id !== member.userId)
                            : [...item.assigneeUserIds, member.userId];
                          const items = value.items.slice();
                          items[index] = { ...item, assigneeUserIds };
                          onChange({ ...value, items });
                        }}
                      />
                      <span>{member.displayName}</span>
                    </label>
                  ))}
                </div>
                {value.items.length <= 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      onChange({
                        ...value,
                        items: value.items.filter((row) => row.key !== item.key),
                      })
                    }
                  >
                    حذف آیتم
                  </Button>
                ) : null}
              </FormStack>
            </fieldset>
          ))}
          <Button type="button" variant="ghost" onClick={addItem}>
            افزودن خط فاکتور
          </Button>
          <div className="splitComposer__extras">
            <TextField
              label="انعام"
              value={value.tipToman}
              onChange={(e) => onChange({ ...value, tipToman: e.target.value })}
            />
            <TextField
              label="مالیات"
              value={value.taxToman}
              onChange={(e) => onChange({ ...value, taxToman: e.target.value })}
            />
            <TextField
              label="تخفیف"
              value={value.discountToman}
              onChange={(e) => onChange({ ...value, discountToman: e.target.value })}
            />
          </div>
        </div>
      ) : null}

      {value.visibility === "private" && canAssignPrivateToOthers ? (
        <fieldset className="splitComposer__fieldset">
          <legend className="splitComposer__legend">این خرج خصوصی مال کیست؟</legend>
          <p className="liveHint">
            فقط همان عضو و شما (مدیر مالی / مادرخرج) این خرج را می‌بینند — بقیه اعضا نه.
          </p>
          <div className="formStack formStack--compact">
            {members.map((member) => (
              <label key={member.userId} className="splitComposer__check">
                <input
                  type="radio"
                  name="private-assignee"
                  checked={value.participantUserIds[0] === member.userId}
                  onChange={() => toggleParticipant(member.userId)}
                />
                <span>{member.displayName}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {value.visibility !== "private" && value.splitMethod !== "itemized" ? (
        <fieldset className="splitComposer__fieldset">
          <legend className="splitComposer__legend">چه کسانی باید سهم بدهند؟</legend>
          <p className="liveHint">
            تیک بزنید کسانی که مصرف کرده‌اند یا باید سهمشان را به پرداخت‌کننده برگردانند.
          </p>
          {members.length === 0 ? (
            <EmptyHint>عضوی نیست — اول دعوت کنید.</EmptyHint>
          ) : (
            <div className="formStack formStack--compact">
              {members.map((member) => (
                <label key={member.userId} className="splitComposer__check">
                  <input
                    type="checkbox"
                    checked={value.participantUserIds.includes(member.userId)}
                    onChange={() => toggleParticipant(member.userId)}
                  />
                  <span>
                    {member.displayName}
                    {member.defaultShares !== 1 ? ` · سهم پیش‌فرض ${member.defaultShares}` : ""}
                  </span>
                  {value.splitMethod !== "equal" &&
                  value.splitMethod !== "formula" &&
                  value.participantUserIds.includes(member.userId) ? (
                    <TextField
                      label={
                        value.splitMethod === "amount"
                          ? "تومان"
                          : value.splitMethod === "percent"
                            ? "درصد"
                            : "سهم"
                      }
                      value={
                        value.lineInputs[member.userId] ??
                        (value.splitMethod === "shares"
                          ? String(member.defaultShares ?? 1)
                          : "")
                      }
                      onChange={(event) =>
                        onChange({
                          ...value,
                          lineInputs: {
                            ...value.lineInputs,
                            [member.userId]: event.target.value,
                          },
                        })
                      }
                    />
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      ) : null}

      {preview.length > 0 ? (
        <div className="splitComposer__preview">
          <p className="liveHint">
            پیش‌نمایش سهم — بعد از ثبت، روی مانده گروه می‌نشیند
            {effectivePayerId ? ` · طلبکار: ${payerName}` : ""}
          </p>
          <DataList>
            {preview.map((line) => {
              const isPayer = effectivePayerId !== "" && line.userId === effectivePayerId;
              const isMe = currentUserId != null && line.userId === currentUserId;
              return (
                <DataRow
                  key={line.userId}
                  title={
                    isPayer
                      ? `${memberLabel(line.userId)}${isMe ? " (شما · سهم مصرف)" : " · طلبکار · سهم مصرف"}`
                      : `${memberLabel(line.userId)} → بدهکار`
                  }
                  trailing={<Amount irrMinor={line.amount.amountMinor} />}
                />
              );
            })}
          </DataList>
        </div>
      ) : personalOnly ? null : (
        <p className="liveHint">برای پیش‌نمایش، مبلغ و اعضا را کامل کنید.</p>
      )}
    </div>
  );
}

export function buildSplitPayloadFromComposer(value: SplitComposerValue): {
  splitMethod: SplitMethod;
  participantUserIds: string[];
  splitLines?: ExpenseSplitLine[];
  items?: ExpenseItemInput[];
  tip?: { amountMinor: string; currency: "IRR" };
  tax?: { amountMinor: string; currency: "IRR" };
  discount?: { amountMinor: string; currency: "IRR" };
  totalMinor?: string;
  formulaBasis?: "area" | "occupancy";
  /** Multi-payer breakdown in IRR minor; omit when single payer. */
  paymentLines?: Array<{ userId: string; amount: { amountMinor: string; currency: "IRR" } }>;
  /** Primary payer — largest payment line when multi-payer. */
  paidByUserId?: string;
} {
  const paymentLines = (() => {
    if (!value.multiPayer) return undefined;
    const lines: Array<{
      userId: string;
      amount: { amountMinor: string; currency: "IRR" };
    }> = [];
    for (const [userId, raw] of Object.entries(value.payerInputs ?? {})) {
      const minor = tomanToMinor(raw);
      if (!minor || minor === "0") continue;
      lines.push({
        userId,
        amount: { amountMinor: minor, currency: "IRR" },
      });
    }
    return lines.length > 0 ? lines : undefined;
  })();
  const paidByFromLines = paymentLines?.length
    ? [...paymentLines].sort(
        (a, b) => Number(b.amount.amountMinor) - Number(a.amount.amountMinor),
      )[0]?.userId
    : undefined;

  if (value.splitMethod === "itemized") {
    const items = buildItemInputs(value);
    const tipMinor = tomanToMinor(value.tipToman);
    const taxMinor = tomanToMinor(value.taxToman);
    const discountMinor = tomanToMinor(value.discountToman);
    const result = allocateItemizedSplit({
      items,
      tip: tipMinor && tipMinor !== "0" ? { amountMinor: tipMinor, currency: "IRR" } : undefined,
      tax: taxMinor && taxMinor !== "0" ? { amountMinor: taxMinor, currency: "IRR" } : undefined,
      discount:
        discountMinor && discountMinor !== "0"
          ? { amountMinor: discountMinor, currency: "IRR" }
          : undefined,
    });
    return {
      splitMethod: "itemized",
      participantUserIds: result.splits.map((line) => line.userId),
      items,
      tip: tipMinor && tipMinor !== "0" ? { amountMinor: tipMinor, currency: "IRR" } : undefined,
      tax: taxMinor && taxMinor !== "0" ? { amountMinor: taxMinor, currency: "IRR" } : undefined,
      discount:
        discountMinor && discountMinor !== "0"
          ? { amountMinor: discountMinor, currency: "IRR" }
          : undefined,
      totalMinor: result.total.amountMinor,
      paymentLines,
      paidByUserId: paidByFromLines,
    };
  }

  if (value.splitMethod === "equal") {
    return {
      splitMethod: "equal",
      participantUserIds: value.participantUserIds,
      paymentLines,
      paidByUserId: paidByFromLines,
    };
  }

  if (value.splitMethod === "formula") {
    return {
      splitMethod: "formula",
      participantUserIds: value.participantUserIds,
      formulaBasis: value.formulaBasis ?? "area",
      paymentLines,
      paidByUserId: paidByFromLines,
    };
  }

  return {
    splitMethod: value.splitMethod,
    participantUserIds: value.participantUserIds,
    splitLines: value.participantUserIds.map((userId) => {
      const raw = value.lineInputs[userId] ?? "0";
      if (value.splitMethod === "amount") {
        return {
          userId,
          amount: { amountMinor: tomanToMinor(raw) ?? "0", currency: "IRR" as const },
        };
      }
      if (value.splitMethod === "percent") {
        return {
          userId,
          amount: { amountMinor: "0", currency: "IRR" as const },
          percent: String(Math.round(Number(raw || "0") * 100)),
        };
      }
      return {
        userId,
        amount: { amountMinor: "0", currency: "IRR" as const },
        shares: Math.max(1, Math.round(Number(raw || "1"))),
      };
    }),
    paymentLines,
    paidByUserId: paidByFromLines,
  };
}

/** @deprecated use buildSplitPayloadFromComposer */
export function buildSplitLinesFromComposer(value: SplitComposerValue): ExpenseSplitLine[] | undefined {
  const payload = buildSplitPayloadFromComposer(value);
  return payload.splitLines;
}
