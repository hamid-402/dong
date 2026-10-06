"use client";

import { useState } from "react";
import type { ConfirmSettlementRequest } from "@dang/contracts";
import { Button, TextField, SelectField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";
import { AppModal } from "@/components/ui/app-modal";

export function ConfirmSettlementDialog({
  pending,
  evidenceRequired,
  onCancel,
  onConfirm,
}: {
  pending?: boolean;
  /** When capabilities.productFlags.settlementEvidence is on. */
  evidenceRequired?: boolean;
  onCancel: () => void;
  onConfirm: (evidence: ConfirmSettlementRequest) => void;
}) {
  const [kind, setKind] = useState<"cash_ack" | "receipt" | "gateway">(
    "cash_ack",
  );
  const [cashAckNote, setCashAckNote] = useState("تسویه نقدی / حضوری تأیید شد");
  const [receiptId, setReceiptId] = useState("");

  function submit() {
    if (kind === "cash_ack") {
      onConfirm({
        evidenceKind: "cash_ack",
        cashAckNote: cashAckNote.trim() || "تسویه نقدی تأیید شد",
      });
      return;
    }
    if (kind === "receipt") {
      onConfirm({
        evidenceKind: "receipt",
        receiptId: receiptId.trim() || undefined,
      });
      return;
    }
    onConfirm({ evidenceKind: "gateway" });
  }

  const canSubmit =
    kind === "gateway" ||
    (kind === "cash_ack" && cashAckNote.trim().length >= 3) ||
    (kind === "receipt" && receiptId.trim().length > 0);

  return (
    <AppModal
      open
      ariaLabel="تأیید تسویه"
      title="تأیید تسویه"
      onClose={onCancel}
    >
      <p className="appModalLead">
        {evidenceRequired
          ? "برای ثبت در دفترکل، نوع شاهد را مشخص کنید."
          : "تأیید می‌کند که مبلغ بین طرفین جابه‌جا شده است."}
      </p>
      <FormStack>
        <SelectField
          label="نوع شاهد"
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as "cash_ack" | "receipt" | "gateway")
          }
        >
          <option value="cash_ack">نقدی / حضوری</option>
          <option value="receipt">رسید تأییدشده</option>
          <option value="gateway">درگاه پرداخت</option>
        </SelectField>
        {kind === "cash_ack" ? (
          <TextField
            label="یادداشت تأیید"
            value={cashAckNote}
            onChange={(e) => setCashAckNote(e.target.value)}
          />
        ) : null}
        {kind === "receipt" ? (
          <TextField
            label="شناسه رسید تأییدشده"
            value={receiptId}
            onChange={(e) => setReceiptId(e.target.value)}
          />
        ) : null}
      </FormStack>
      <div className="appModalActions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          انصراف
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !canSubmit}>
          تأیید تسویه
        </Button>
      </div>
    </AppModal>
  );
}
