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

export type SplitComposerValue = {
  splitMethod: SplitMethod;
  participantUserIds: string[];
  /** Toman strings keyed by userId for amount/percent/shares entry. */
  lineInputs: Record<string, string>;
  visibility: ExpenseVisibility;
  /** Itemized receipt lines (toman amounts in UI). */
  items: Array<{
    key: string;
    title: string;
    toman: string;
    assigneeUserIds: string[];
  }>;
  tipToman: string;
  taxToman: string;
  discountToman: string;
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
    items: [],
    tipToman: "",
    taxToman: "",
    discountToman: "",
  };
}

function buildItemInputs(value: SplitComposerValue): ExpenseItemInput[] {
  return value.items
    .filter((item) => item.title.trim() && item.assigneeUserIds.length > 0)
    .map((item) => ({
      title: item.title.trim(),
      amount: {
        amountMinor: tomanToMinor(item.toman) ?? "0",
        currency: "IRR" as const,
      },
      assigneeUserIds: item.assigneeUserIds,
    }));
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
}: Props) {
  const preview = useMemo(() => {
    try {
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

  const payerName =
    (currentUserId && members.find((m) => m.userId === currentUserId)?.displayName) ||
    "شما";

  return (
    <div className="splitComposer">
      {!personalOnly && value.visibility === "shared" ? (
        <div className="splitComposer__payer" role="note">
          <b>پرداخت‌کننده: {payerName}</b>
          <span>
            شما پول را داده‌اید؛ سهم هر عضو در پیش‌نمایش مشخص می‌شود تا بعداً تأیید و تسویه
            کنند.
          </span>
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
        </SelectField>
      ) : null}

      {value.visibility !== "private" && value.splitMethod === "itemized" ? (
        <div className="splitComposer">
          <p className="liveHint">هر خط سفارش را به نفر(ها) تخصیص دهید — آیتم مشترک = چند نفر</p>
          {value.items.map((item, index) => (
            <fieldset key={item.key} className="splitComposer__fieldset">
              <legend className="splitComposer__legend">آیتم {index + 1}</legend>
              <FormStack density="compact">
                <TextField
                  label="عنوان"
                  value={item.title}
                  onChange={(event) => {
                    const items = value.items.slice();
                    items[index] = { ...item, title: event.target.value };
                    onChange({ ...value, items });
                  }}
                />
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
            {currentUserId ? ` · طلبکار: ${payerName}` : ""}
          </p>
          <DataList>
            {preview.map((line) => {
              const isPayer = currentUserId != null && line.userId === currentUserId;
              return (
                <DataRow
                  key={line.userId}
                  title={
                    isPayer
                      ? `${memberLabel(line.userId)} (شما · سهم مصرف)`
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
} {
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
    };
  }

  if (value.splitMethod === "equal") {
    return {
      splitMethod: "equal",
      participantUserIds: value.participantUserIds,
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
  };
}

/** @deprecated use buildSplitPayloadFromComposer */
export function buildSplitLinesFromComposer(value: SplitComposerValue): ExpenseSplitLine[] | undefined {
  const payload = buildSplitPayloadFromComposer(value);
  return payload.splitLines;
}
