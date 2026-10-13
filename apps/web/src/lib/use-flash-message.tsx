"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Toast } from "@dang/ui";
import { MotionSuccessMark } from "@/components/visual/motion-scene";

/** Short-lived success banner + shared error state for form views. */
export function useFlashMessage() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flashSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setError(null);
    window.setTimeout(() => setSuccessMessage(null), 4000);
  }, []);

  const setErrorMessage = useCallback((message: string | null) => {
    setError(message);
    if (message) setSuccessMessage(null);
  }, []);

  const dismissSuccess = useCallback(() => setSuccessMessage(null), []);
  const dismissError = useCallback(() => setError(null), []);

  return {
    successMessage,
    error,
    setError: setErrorMessage,
    flashSuccess,
    dismissSuccess,
    dismissError,
  };
}

/** One toast region. Errors stay until dismissed; success can also be closed. */
export function FlashMessages({
  successMessage,
  error,
  onDismissSuccess,
  onDismissError,
}: {
  successMessage?: string | null;
  error?: string | null;
  onDismissSuccess?: () => void;
  onDismissError?: () => void;
}): ReactNode {
  const [hiddenSuccess, setHiddenSuccess] = useState<string | null>(null);
  const [hiddenError, setHiddenError] = useState<string | null>(null);
  useEffect(() => {
    if (!error) setHiddenError(null);
  }, [error]);
  useEffect(() => {
    if (!successMessage) setHiddenSuccess(null);
  }, [successMessage]);
  const showError = Boolean(error) && error !== hiddenError;
  const showSuccess = Boolean(successMessage) && successMessage !== hiddenSuccess;
  if (!showError && !showSuccess) return null;

  return (
    <div className="dang-toast-region" aria-live="polite" aria-label="اعلان‌ها">
      {showError ? (
        <Toast
          tone="error"
          onDismiss={() => {
            setHiddenError(error ?? null);
            onDismissError?.();
          }}
        >
          {error}
        </Toast>
      ) : null}
      {showSuccess ? (
        <Toast
          tone="success"
          onDismiss={() => {
            setHiddenSuccess(successMessage ?? null);
            onDismissSuccess?.();
          }}
        >
          <MotionSuccessMark active />
          {successMessage}
        </Toast>
      ) : null}
    </div>
  );
}
