"use client";

import { useState } from "react";
import { Button, TextField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";

const REASON_PRESETS = [
  { id: "mistaken_entry", label: "ثبت اشتباه" },
  { id: "duplicate", label: "تکراری" },
  { id: "wrong_amount", label: "مبلغ غلط" },
  { id: "other", label: "دلیل دیگر" },
] as const;

export function ReverseExpenseDialog({
  expenseTitle,
  pending,
  onCancel,
  onConfirm,
  onConfirmRevise,
}: {
  expenseTitle?: string;
  pending?: boolean;
  onCancel: () => void;
  /** Soft-void only. */
  onConfirm: (reason: string) => void;
  /** Soft-void then open the create form prefilled for a corrected replacement. */
  onConfirmRevise?: (reason: string) => void;
}) {
  const [preset, setPreset] =
    useState<(typeof REASON_PRESETS)[number]["id"]>("mistaken_entry");
  const [detail, setDetail] = useState("");

  function buildReason(): string {
    const reason =
      preset === "other"
        ? detail.trim() || "other"
        : detail.trim()
          ? `${preset}: ${detail.trim()}`
          : preset;
    return reason.slice(0, 500);
  }

  const canSubmit = !(preset === "other" && !detail.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reverse-expense-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "grid",
        placeItems: "center",
        background: "color-mix(in srgb, #0b1210 72%, transparent)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(440px, 100%)",
          background: "var(--surface, #fff)",
          borderRadius: 14,
          border: "1px solid var(--line)",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        <div>
          <h2 id="reverse-expense-title" style={{ margin: 0, fontSize: "1.1rem" }}>
            برگشت یا اصلاح خرج
          </h2>
          <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: "0.9rem" }}>
            {expenseTitle
              ? `«${expenseTitle}» از دفترکل برگشت می‌خورد؛ حذف سخت نیست.`
              : "اثر مالی خنثی می‌شود؛ حذف سخت انجام نمی‌شود."}
            {` اگر به تنخواه لینک بوده، موجودی صندوق هم جبران می‌شود.`}
          </p>
        </div>
        <FormStack>
          <label style={{ display: "grid", gap: 6, fontSize: "0.9rem" }}>
            دلیل
            <select
              value={preset}
              onChange={(e) =>
                setPreset(e.target.value as (typeof REASON_PRESETS)[number]["id"])
              }
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--line)",
              }}
            >
              {REASON_PRESETS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <TextField
            label={preset === "other" ? "توضیح (لازم)" : "توضیح اختیاری"}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </FormStack>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            justifyContent: "flex-end",
          }}
        >
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            انصراف
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onConfirm(buildReason())}
            disabled={pending || !canSubmit}
          >
            فقط برگشت
          </Button>
          {onConfirmRevise ? (
            <Button
              type="button"
              onClick={() => onConfirmRevise(buildReason())}
              disabled={pending || !canSubmit}
            >
              اصلاح و ثبت دوباره
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
