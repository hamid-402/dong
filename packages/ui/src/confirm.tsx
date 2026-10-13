"use client";

import {
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  createContext,
  type ReactNode,
} from "react";
import { Button } from "./button.js";
import { Modal } from "./modal.js";

export type ConfirmTone = "danger" | "default";

export type ConfirmRequest = {
  title?: string;
  description: string;
  /** Large Persian-digit amount shown above the action sentence. */
  amount?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export type NormalizedConfirm = {
  title: string;
  description: string;
  amount?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
};

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  amount?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function inferConfirmLabel(description: string): string {
  if (description.includes("حذف")) return "حذف";
  if (description.includes("خارج")) return "تأیید";
  if (description.includes("بایگانی")) return "بایگانی";
  if (description.includes("ابطال")) return "ابطال";
  if (description.includes("باطل")) return "ابطال";
  if (description.includes("لغو")) return "لغو";
  if (description.includes("مسدود")) return "مسدود کردن";
  if (description.includes("رد شود") || description.includes("رد شوند")) return "رد";
  return "تأیید";
}

export function normalizeConfirm(request: ConfirmRequest | string): NormalizedConfirm {
  const description = typeof request === "string" ? request : request.description;
  const tone = typeof request === "string" ? "danger" : (request.tone ?? "danger");
  const amount = typeof request === "string" ? undefined : request.amount?.trim() || undefined;
  return {
    title: typeof request === "string" || !request.title ? "تأیید" : request.title,
    description,
    amount,
    confirmLabel:
      typeof request === "string" || !request.confirmLabel
        ? inferConfirmLabel(description)
        : request.confirmLabel,
    cancelLabel: typeof request === "string" || !request.cancelLabel ? "انصراف" : request.cancelLabel,
    tone,
  };
}

export function ConfirmDialog({
  open,
  title,
  description,
  amount,
  confirmLabel = "تأیید",
  cancelLabel = "انصراف",
  tone = "danger",
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const descriptionId = useId();
  return (
    <Modal open={open} title={title} onClose={pending ? undefined : onCancel} describedBy={descriptionId}>
      {amount ? <p className="dang-confirm__amount">{amount}</p> : null}
      <p id={descriptionId} className="dang-confirm__text">
        {description}
      </p>
      <div className="dang-dialog__actions">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          loading={pending}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export type ConfirmFn = (request: ConfirmRequest | string) => Promise<boolean>;

type PendingConfirm = NormalizedConfirm & {
  resolve: (value: boolean) => void;
};

const missingConfirm: ConfirmFn = () => {
  throw new Error("useConfirm must be used inside ConfirmProvider");
};

const ConfirmContext = createContext<ConfirmFn>(missingConfirm);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const confirm = useCallback<ConfirmFn>((request) => {
    const previous = pendingRef.current;
    if (previous) previous.resolve(false);
    const next = normalizeConfirm(request);
    return new Promise<boolean>((resolve) => {
      const record = { ...next, resolve };
      pendingRef.current = record;
      setPending(record);
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending != null}
        title={pending?.title ?? ""}
        description={pending?.description ?? ""}
        amount={pending?.amount}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        tone={pending?.tone}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
