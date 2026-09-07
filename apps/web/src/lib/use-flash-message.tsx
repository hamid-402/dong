"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Toast } from "@dang/ui";

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

  return {
    successMessage,
    error,
    setError: setErrorMessage,
    flashSuccess,
  };
}

/** Accessible flash regions — prefer these over raw `<p className="liveSuccess">`. */
export function FlashMessages({
  successMessage,
  error,
}: {
  successMessage?: string | null;
  error?: string | null;
}): ReactNode {
  return (
    <>
      {error ? (
        <Toast tone="error" style={{ marginBottom: 12 }}>
          {error}
        </Toast>
      ) : null}
      {successMessage ? (
        <Toast tone="success" style={{ marginBottom: 12 }}>
          {successMessage}
        </Toast>
      ) : null}
    </>
  );
}
