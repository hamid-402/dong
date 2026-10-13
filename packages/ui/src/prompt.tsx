"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  createContext,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "./button.js";
import type { ConfirmTone } from "./confirm.js";
import { TextField } from "./field.js";
import { Modal } from "./modal.js";

export type PromptRequest = {
  title: string;
  description?: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  inputType?: "text" | "password";
  autoComplete?: string;
  /** Empty confirm is rejected unless this is false. */
  required?: boolean;
  /** Confirm stays disabled until the trimmed value matches exactly. */
  confirmExact?: string;
};

type NormalizedPrompt = {
  id: number;
  title: string;
  description?: string;
  label: string;
  hint?: string;
  defaultValue: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: ConfirmTone;
  inputType: "text" | "password";
  autoComplete: string;
  required: boolean;
  confirmExact?: string;
};

export type PromptDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  hint?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  inputType?: "text" | "password";
  autoComplete?: string;
  required?: boolean;
  confirmExact?: string;
  pending?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

function submittedValue(value: string, inputType: "text" | "password"): string {
  return inputType === "password" ? value : value.trim();
}

let promptSeq = 0;

function normalizePrompt(request: PromptRequest): NormalizedPrompt {
  promptSeq += 1;
  const inputType = request.inputType ?? "text";
  const confirmExact = request.confirmExact;
  return {
    id: promptSeq,
    title: request.title,
    description:
      request.description ??
      (confirmExact ? `برای تأیید این عبارت را دقیقاً تایپ کنید: ${confirmExact}` : undefined),
    label: request.label,
    hint: request.hint,
    defaultValue: request.defaultValue ?? "",
    placeholder: request.placeholder,
    confirmLabel: request.confirmLabel ?? "تأیید",
    cancelLabel: request.cancelLabel ?? "انصراف",
    tone: request.tone ?? (confirmExact ? "danger" : "default"),
    inputType,
    autoComplete: request.autoComplete ?? (inputType === "password" ? "current-password" : "off"),
    required: confirmExact != null ? true : (request.required ?? true),
    confirmExact,
  };
}

export function PromptDialog({
  open,
  title,
  description,
  label,
  hint,
  defaultValue = "",
  placeholder,
  confirmLabel = "تأیید",
  cancelLabel = "انصراف",
  tone = "default",
  inputType = "text",
  autoComplete,
  required = true,
  confirmExact,
  pending = false,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const descriptionId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const exact = confirmExact;
  const mustMatch = exact != null;
  const fieldRequired = mustMatch ? true : required;
  const resolvedType = inputType;
  const resolvedAutoComplete =
    autoComplete ?? (resolvedType === "password" ? "current-password" : "off");
  const ltr = resolvedType === "password" || mustMatch;
  const body =
    description ?? (exact ? `برای تأیید این عبارت را دقیقاً تایپ کنید: ${exact}` : undefined);

  useEffect(() => {
    if (!open) return;
    setValue(defaultValue);
    setError(null);
  }, [open, defaultValue]);

  const current = submittedValue(value, resolvedType);
  const canSubmit =
    !pending && (exact == null || current === exact) && (!fieldRequired || current.length > 0);

  function trySubmit() {
    if (pending) return;
    if (exact != null && current !== exact) {
      setError("عبارت تأیید نادرست است");
      return;
    }
    if (fieldRequired && current.length === 0) {
      setError("این مقدار لازم است");
      return;
    }
    onConfirm(current);
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    trySubmit();
  }

  function onFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    trySubmit();
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={pending ? undefined : onCancel}
      describedBy={body ? descriptionId : undefined}
    >
      {body ? (
        <p id={descriptionId} className="dang-confirm__text">
          {body}
        </p>
      ) : null}
      <form className="dang-prompt__form" noValidate onSubmit={onFormSubmit}>
        <TextField
          label={label}
          hint={hint}
          value={value}
          placeholder={placeholder}
          error={error ?? undefined}
          required={fieldRequired}
          type={resolvedType}
          autoComplete={resolvedAutoComplete}
          dir={ltr ? "ltr" : undefined}
          disabled={pending}
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={onFieldKeyDown}
        />
        <div className="dang-dialog__actions">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="submit"
            variant={tone === "danger" ? "danger" : "primary"}
            disabled={!canSubmit}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export type PromptFn = (request: PromptRequest) => Promise<string | null>;

type PendingPrompt = NormalizedPrompt & {
  resolve: (value: string | null) => void;
};

const missingPrompt: PromptFn = () => {
  throw new Error("usePrompt must be used inside PromptProvider");
};

const PromptContext = createContext<PromptFn>(missingPrompt);

export function PromptProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const pendingRef = useRef<PendingPrompt | null>(null);

  const settle = useCallback((value: string | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  const prompt = useCallback<PromptFn>((request) => {
    const previous = pendingRef.current;
    if (previous) previous.resolve(null);
    const next = normalizePrompt(request);
    return new Promise<string | null>((resolve) => {
      const record = { ...next, resolve };
      pendingRef.current = record;
      setPending(record);
    });
  }, []);

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <PromptDialog
        key={pending?.id ?? "closed"}
        open={pending != null}
        title={pending?.title ?? ""}
        description={pending?.description}
        label={pending?.label ?? ""}
        hint={pending?.hint}
        defaultValue={pending?.defaultValue ?? ""}
        placeholder={pending?.placeholder}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        tone={pending?.tone}
        inputType={pending?.inputType}
        autoComplete={pending?.autoComplete}
        required={pending?.required}
        confirmExact={pending?.confirmExact}
        onConfirm={(value) => settle(value)}
        onCancel={() => settle(null)}
      />
    </PromptContext.Provider>
  );
}

export function usePrompt(): PromptFn {
  return useContext(PromptContext);
}
