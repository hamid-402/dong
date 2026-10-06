"use client";

import { useState } from "react";
import { Button, TextField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";
import { AppModal } from "@/components/ui/app-modal";

const REASON_PRESETS = [
  { id: "mistaken_entry", label: "ثبت اشتباه" },
  { id: "duplicate", label: "تکراری" },
  { id: "wrong_amount", label: "مبلغ غلط" },
  { id: "other", label: "دلیل دیگر" },
] as const;

export function ReverseExpenseDialog({
  expenseTitle,
  pending,
  intent = "revise",
  onCancel,
  onConfirm,
  onConfirmRevise,
}: {
  expenseTitle?: string;
  pending?: boolean;
  /** revise = edit+replace; void = soft-delete only. */
  intent?: "revise" | "void";
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
  const voidOnly = intent === "void" || !onConfirmRevise;

  return (
    <AppModal
      open
      ariaLabel={voidOnly ? "حذف / ابطال خرج" : "ویرایش خرج"}
      title={voidOnly ? "حذف / ابطال خرج" : "ویرایش خرج"}
      onClose={onCancel}
    >
      <p className="appModalLead">
        {expenseTitle ? `«${expenseTitle}» ` : null}
        {voidOnly
          ? "اثر مالی‌اش از مانده خنثی می‌شود؛ حذف سخت از دیتابیس نیست. اگر به تنخواه لینک بوده، موجودی صندوق هم جبران می‌شود."
          : "اثر فعلی خنثی می‌شود و فرم بالای صفحه برای ثبت جایگزین پر می‌شود. اگر فقط ابطال می‌خواهید، «فقط حذف از مانده» را بزنید."}
      </p>
      <FormStack>
        <label className="appModalFieldLabel">
          دلیل
          <select
            className="appModalSelect"
            value={preset}
            onChange={(e) =>
              setPreset(e.target.value as (typeof REASON_PRESETS)[number]["id"])
            }
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
      <div className="appModalActions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          انصراف
        </Button>
        <Button
          type="button"
          variant={voidOnly ? "danger" : "ghost"}
          onClick={() => onConfirm(buildReason())}
          disabled={pending || !canSubmit}
        >
          {voidOnly ? "حذف از مانده" : "فقط حذف از مانده"}
        </Button>
        {!voidOnly && onConfirmRevise ? (
          <Button
            type="button"
            onClick={() => onConfirmRevise(buildReason())}
            disabled={pending || !canSubmit}
          >
            ویرایش و ثبت دوباره
          </Button>
        ) : null}
      </div>
    </AppModal>
  );
}
