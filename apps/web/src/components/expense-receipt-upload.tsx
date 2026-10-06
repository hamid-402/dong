"use client";

import { useEffect, useState, useTransition } from "react";
import type { AttachmentSummary, OcrReceiptResult } from "@dang/contracts";
import { formatJalaliIso } from "@dang/contracts";
import { Button } from "@dang/ui";
import { api } from "@/lib/api";
import { uploadErrorMessage } from "@/lib/api-errors";
import { readFileAsBase64, resolveUploadMimeType, sha256HexFromFile } from "@/lib/file-hash";
import { irrMinorToDisplayInput } from "@/lib/irr-money";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyUnitSuffix } from "@/lib/money-labels";

const MAX_BYTES = 10 * 1024 * 1024;

export type OcrFormHints = {
  title?: string;
  amountToman?: string;
  lineItems?: Array<{ title: string; quantity?: string; amountMinor?: string }>;
  taxMinor?: string;
  occurredOn?: string;
};

export function ExpenseReceiptUpload({
  workspaceId,
  expenseId,
  onUploaded,
  /** When providers.ocr === configured, show apply; stub shows honest label only. */
  ocrMode,
  onApplyOcr,
}: {
  workspaceId: string;
  expenseId: string;
  onUploaded?: (attachment: AttachmentSummary) => void;
  ocrMode?: "stub" | "configured";
  onApplyOcr?: (hints: OcrFormHints) => void;
}) {
  const displayUnit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(displayUnit);
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocrById, setOcrById] = useState<Record<string, OcrReceiptResult>>({});
  const [pending, startTransition] = useTransition();

  function loadAttachments() {
    setLoadingList(true);
    setListError(null);
    void (async () => {
      try {
        const list = await api.listAttachments(workspaceId, "expense", expenseId);
        const receipts = list.filter((item) => item.kind === "receipt");
        setAttachments(receipts);
        const fromPersisted: Record<string, OcrReceiptResult> = {};
        for (const row of receipts) {
          if (row.ocrResult) {
            fromPersisted[row.id] = {
              attachmentId: row.id,
              workspaceId: row.workspaceId,
              jobId: row.ocrResult.jobId,
              status: row.ocrResult.status,
              merchantHint: row.ocrResult.merchantHint,
              amountMinorHint: row.ocrResult.amountMinorHint,
              lineItems: row.ocrResult.lineItems,
              taxMinor: row.ocrResult.taxMinor,
              occurredOn: row.ocrResult.occurredOn,
              rawTextPreview: row.ocrResult.rawTextPreview,
              completedAt: row.ocrResult.completedAt,
            };
          }
        }
        if (Object.keys(fromPersisted).length) {
          setOcrById((prev) => ({ ...prev, ...fromPersisted }));
        }
      } catch (err: unknown) {
        setListError(friendlyListError(err));
        setAttachments([]);
      } finally {
        setLoadingList(false);
      }
    })();
  }

  function friendlyListError(err: unknown): string {
    return uploadErrorMessage(err, "بارگذاری رسیدها ناموفق");
  }

  useEffect(() => {
    loadAttachments();
  }, [workspaceId, expenseId]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError("حجم فایل بیش از ۱۰ مگابایت است");
      setMessage(null);
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          setMessage(null);
          const mimeType = resolveUploadMimeType(file);
          const contentHash = await sha256HexFromFile(file);
          const attachment = await api.createAttachment(workspaceId, {
            workspaceId,
            targetType: "expense",
            targetId: expenseId,
            kind: "receipt",
            fileName: file.name,
            mimeType,
            sizeBytes: file.size,
            contentHash,
            idempotencyKey: `receipt:${expenseId}:${contentHash.slice(0, 16)}`,
          });
          const contentBase64 = await readFileAsBase64(file);
          const stored = await api.uploadAttachmentContent(workspaceId, attachment.id, {
            contentBase64,
          });
          setAttachments((prev) => {
            const next = prev.filter((item) => item.id !== stored.id);
            return [...next, stored];
          });
          setMessage(stored.hasBlob ? `رسید «${file.name}» ذخیره شد` : "رسید ثبت شد");
          onUploaded?.(stored);
          if (ocrMode === "configured") {
            try {
              const ocr = await api.runAttachmentOcr(workspaceId, stored.id);
              setOcrById((prev) => ({ ...prev, [stored.id]: ocr }));
              setMessage(
                ocr.status === "completed"
                  ? `رسید ذخیره شد — پیشنهاد OCR آماده است`
                  : `رسید ذخیره شد (OCR: ${ocr.status})`,
              );
            } catch {
              // OCR is additive — upload already succeeded.
            }
          }
        } catch (err: unknown) {
          setMessage(null);
          setError(uploadErrorMessage(err, "آپلود رسید ناموفق"));
        }
      })();
    });
  }

  function onDownload(attachment: AttachmentSummary) {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          const blob = await api.fetchAttachmentContent(workspaceId, attachment.id);
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = attachment.fileName;
          anchor.click();
          URL.revokeObjectURL(url);
        } catch (err: unknown) {
          setError(uploadErrorMessage(err, "دانلود رسید ناموفق"));
        }
      })();
    });
  }

  function onRunOcr(attachment: AttachmentSummary) {
    startTransition(() => {
      void (async () => {
        try {
          setError(null);
          const ocr = await api.runAttachmentOcr(workspaceId, attachment.id);
          setOcrById((prev) => ({ ...prev, [attachment.id]: ocr }));
        } catch (err: unknown) {
          setError(uploadErrorMessage(err, "OCR ناموفق"));
        }
      })();
    });
  }

  function applyOcr(ocr: OcrReceiptResult) {
    if (!onApplyOcr) return;
    onApplyOcr({
      title: ocr.merchantHint,
      amountToman: ocr.amountMinorHint
        ? irrMinorToDisplayInput(ocr.amountMinorHint, displayUnit)
        : undefined,
      lineItems: ocr.lineItems,
      taxMinor: ocr.taxMinor,
      occurredOn: ocr.occurredOn,
    });
    setMessage("پیشنهاد OCR روی فرم اعمال شد — قبل از ثبت بررسی کنید");
  }

  return (
    <div className="receiptUpload">
      <label className="receiptUpload__label">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          disabled={pending}
          onChange={onFileChange}
        />
        {pending ? "در حال آپلود…" : "پیوست رسید"}
      </label>
      {ocrMode === "stub" ? (
        <p className="emptyHint">OCR در این محیط stub است — پیشنهاد خودکار اعمال نمی‌شود.</p>
      ) : null}
      {loadingList ? <p className="emptyHint">در حال بارگذاری پیوست‌ها…</p> : null}
      {listError ? (
        <p className="liveError">
          {listError}{" "}
          <button type="button" className="textButton" onClick={loadAttachments}>
            تلاش مجدد
          </button>
        </p>
      ) : null}
      {!loadingList && attachments.length > 0 ? (
        <ul className="receiptUpload__list">
          {attachments.map((attachment) => {
            const ocr = ocrById[attachment.id];
            const quarantine = attachment.quarantineStatus ?? "pending";
            const blocked =
              quarantine === "blocked" || quarantine === "error";
            const clean = quarantine === "clean";
            const quarantineLabel =
              quarantine === "clean"
                ? "اسکن: پاک"
                : quarantine === "blocked"
                  ? "قرنطینه — دانلود/OCR مسدود"
                  : quarantine === "error"
                    ? "خطای اسکن"
                    : quarantine === "scanning"
                      ? "در حال اسکن…"
                      : "اسکن در انتظار";
            return (
              <li key={attachment.id} className="receiptUpload__item">
                <span>{attachment.fileName}</span>
                <span className="emptyHint">{quarantineLabel}</span>
                {attachment.hasBlob && !blocked ? (
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => onDownload(attachment)}>
                    دانلود
                  </Button>
                ) : attachment.hasBlob && blocked ? (
                  <span className="emptyHint">دانلود غیرفعال</span>
                ) : (
                  <span className="emptyHint">فقط اطلاعات</span>
                )}
                {ocrMode === "configured" && !ocr && clean ? (
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => onRunOcr(attachment)}>
                    OCR
                  </Button>
                ) : null}
                {ocrMode === "configured" && !ocr && !clean ? (
                  <span className="emptyHint">OCR پس از اسکن پاک</span>
                ) : null}
                {ocrMode === "configured" &&
                ocr?.status === "completed" &&
                (ocr.merchantHint ||
                  ocr.amountMinorHint ||
                  ocr.taxMinor ||
                  ocr.occurredOn ||
                  (ocr.lineItems?.length ?? 0) > 0) ? (
                  <span className="emptyHint">
                    {ocr.merchantHint ?? "—"}
                    {ocr.amountMinorHint
                      ? ` · ${irrMinorToDisplayInput(ocr.amountMinorHint, displayUnit)} ${unitLabel}`
                      : ""}
                    {ocr.taxMinor
                      ? ` · مالیات ${irrMinorToDisplayInput(ocr.taxMinor, displayUnit)} ${unitLabel}`
                      : ""}
                    {ocr.occurredOn ? ` · تاریخ ${formatJalaliIso(ocr.occurredOn)}` : ""}
                    {ocr.lineItems && ocr.lineItems.length > 0 ? (
                      <ul>
                        {ocr.lineItems.map((line, index) => (
                          <li key={`${line.title}-${index}`}>
                            {line.title}
                            {line.quantity ? ` × ${line.quantity}` : ""}
                            {line.amountMinor
                              ? ` · ${irrMinorToDisplayInput(line.amountMinor, displayUnit)} ${unitLabel}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {onApplyOcr ? (
                      <>
                        {" "}
                        <button type="button" className="textButton" onClick={() => applyOcr(ocr)}>
                          اعمال روی فرم
                        </button>
                      </>
                    ) : null}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {message ? <p className="liveSuccess">{message}</p> : null}
      {error ? <p className="liveError">{error}</p> : null}
    </div>
  );
}
