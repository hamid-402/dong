"use client";

import { PromptDialog } from "@dang/ui";

/** Typed-confirm gate for demo seed/purge — confirm string must match API literally. */
export function DemoConfirmDialog({
  title,
  confirmExact,
  label = "دمو",
  onCancel,
  onConfirm,
  pending,
}: {
  title: string;
  confirmExact: string;
  label?: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  return (
    <PromptDialog
      open
      title={title}
      description={`برای تأیید این عبارت را دقیقاً تایپ کنید: ${confirmExact}`}
      label="عبارت تأیید"
      hint={`برچسب ${label} · اقدام صریح`}
      confirmExact={confirmExact}
      confirmLabel={pending ? "در حال اجرا…" : "تأیید"}
      pending={pending}
      onCancel={onCancel}
      onConfirm={() => onConfirm()}
    />
  );
}
