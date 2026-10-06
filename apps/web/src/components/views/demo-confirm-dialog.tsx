"use client";

import { useState } from "react";
import { Button, TextField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";
import { AppModal } from "@/components/ui/app-modal";

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
  const [typed, setTyped] = useState("");
  const ok = typed.trim() === confirmExact;

  return (
    <AppModal open ariaLabel={title} onClose={onCancel}>
      <p className="liveHint" style={{ marginTop: 0 }}>
        برچسب {label} · اقدام صریح
      </p>
      <h3 id="demo-confirm-title" style={{ margin: "0 0 0.5rem", fontSize: "1.05rem" }}>
        {title}
      </h3>
      <p className="liveHint">
        برای تأیید این عبارت را دقیقاً تایپ کنید:{" "}
        <code>{confirmExact}</code>
      </p>
      <FormStack>
        <TextField
          label="عبارت تأیید"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        <div className="appModalActions" style={{ justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            انصراف
          </Button>
          <Button type="button" onClick={onConfirm} disabled={!ok || pending}>
            {pending ? "در حال اجرا…" : "تأیید"}
          </Button>
        </div>
      </FormStack>
    </AppModal>
  );
}
