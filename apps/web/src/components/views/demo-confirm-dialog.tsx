"use client";

import { useState } from "react";
import { Button, TextField } from "@dang/ui";
import { FormStack } from "@/components/ui-blocks";

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-confirm-title"
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
          padding: "1.1rem 1.2rem",
          borderRadius: 14,
          border: "1px solid var(--dang-line, rgba(220,229,225,0.15))",
          background: "var(--dang-surface-2, #16211e)",
        }}
      >
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
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
              انصراف
            </Button>
            <Button type="button" onClick={onConfirm} disabled={!ok || pending}>
              {pending ? "در حال اجرا…" : "تأیید"}
            </Button>
          </div>
        </FormStack>
      </div>
    </div>
  );
}
