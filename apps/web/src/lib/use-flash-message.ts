"use client";

import { useCallback, useState } from "react";

/** Short-lived success banner + shared error state for form views. */
export function useFlashMessage() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flashSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(null), 4000);
  }, []);

  return { successMessage, error, setError, flashSuccess };
}
