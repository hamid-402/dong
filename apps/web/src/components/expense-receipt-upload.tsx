"use client";

import { useEffect, useState, useTransition } from "react";
import type { AttachmentSummary } from "@dang/contracts";
import { Button } from "@dang/ui";
import { api } from "@/lib/api";
import { uploadErrorMessage } from "@/lib/api-errors";
import { readFileAsBase64, resolveUploadMimeType, sha256HexFromFile } from "@/lib/file-hash";

const MAX_BYTES = 10 * 1024 * 1024;

export function ExpenseReceiptUpload({
  workspaceId,
  expenseId,
  onUploaded,
}: {
  workspaceId: string;
  expenseId: string;
  onUploaded?: (attachment: AttachmentSummary) => void;
}) {
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function loadAttachments() {
    setLoadingList(true);
    setListError(null);
    void (async () => {
      try {
        const list = await api.listAttachments(workspaceId, "expense", expenseId);
        setAttachments(list.filter((item) => item.kind === "receipt"));
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
          {attachments.map((attachment) => (
            <li key={attachment.id} className="receiptUpload__item">
              <span>{attachment.fileName}</span>
              {attachment.hasBlob ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => onDownload(attachment)}>
                  دانلود
                </Button>
              ) : (
                <span className="emptyHint">فقط اطلاعات</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? <p className="liveSuccess">{message}</p> : null}
      {error ? <p className="liveError">{error}</p> : null}
    </div>
  );
}
