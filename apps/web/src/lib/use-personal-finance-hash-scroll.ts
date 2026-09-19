"use client";

import { useEffect } from "react";

const SECTION_IDS = ["overview", "goals", "charts", "resources", "personal-expense"] as const;

/**
 * Scroll to `#section` on mount / hashchange for personal finance surfaces (G16).
 */
export function usePersonalFinanceHashScroll(): void {
  useEffect(() => {
    function scrollToHash() {
      const raw = window.location.hash.replace(/^#/, "").trim();
      if (!raw) return;
      if (!(SECTION_IDS as readonly string[]).includes(raw)) return;
      const el = document.getElementById(raw);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);
}
