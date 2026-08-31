"use client";

import { useEffect } from "react";

/** Registers the Phase 5 service worker once on the client. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore registration failures in local/dev */
    });
  }, []);
  return null;
}
