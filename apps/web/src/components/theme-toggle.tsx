"use client";

import { useOptionalTheme } from "@/lib/theme";

/** Header control — falls back to no-op if provider missing. */
export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const themeApi = useOptionalTheme();
  if (!themeApi) return null;

  const { theme, toggleTheme } = themeApi;
  const label = theme === "light" ? "تم تیره" : "تم روشن";

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span className="theme-toggle__icon" aria-hidden>
        {theme === "light" ? "◐" : "◑"}
      </span>
      <span className="theme-toggle__label">{theme === "light" ? "تیره" : "روشن"}</span>
    </button>
  );
}
