"use client";

import { useState } from "react";
import type { ConfirmSettlementRequest } from "@dang/contracts";
import { Button, TextField, SelectField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-settlement-title"
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
          width: "min(420px, 100%)",
          background: "var(--surface, #fff)",
          borderRadius: 14,
          border: "1px solid var(--line)",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        <div>
          <h2
            id="confirm-settlement-title"
            style={{ margin: 0, fontSize: "1.1rem" }}
          >
            تأیید تسویه
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              color: "var(--muted)",
              fontSize: "0.9rem",
            }}
          >
            {evidenceRequired
              ? "برای ثبت در دفترکل، نوع شاهد را مشخص کنید."
              : "تأیید می‌کند که مبلغ بین طرفین جابه‌جا شده است."}
          </p>
        </div>
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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            انصراف
          </Button>
          <Button type="button" onClick={submit} disabled={pending || !canSubmit}>
            تأیید تسویه
          </Button>
        </div>
      </div>
    </div>
  );
}
