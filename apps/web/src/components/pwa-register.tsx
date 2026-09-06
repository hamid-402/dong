"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker in production only.
 * In local/dev we actively unregister — a stale SW caches HTML that points at
 * deleted `/_next/static/...` chunks after `.next` rebuilds (404 + blank page).
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.startsWith("dang-")).map((k) => caches.delete(k)));
        }
      })();
      return;
    }

    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* ignore registration failures */
    });
  }, []);

  return null;
}
