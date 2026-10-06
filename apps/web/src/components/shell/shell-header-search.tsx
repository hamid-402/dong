"use client";

import { ShellIconSvg } from "@/components/shell/shell-icons";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import { t } from "@/lib/i18n";

/**
 * Header search affordance — opens the existing command palette (live destinations).
 */
export function ShellHeaderSearchField({
  variant = "field",
}: {
  variant?: "field" | "icon";
}) {
  const shell = useShellV2Api();
  const open = shell?.commandPaletteOpen ?? false;

  return (
    <button
      type="button"
      className={
        variant === "field"
          ? "shell-v2__search shell-v2__search--field"
          : "shell-v2__search shell-v2__search--icon"
      }
      onClick={() => shell?.openCommandPalette()}
      title={t("shell.searchTitle")}
      aria-label={t("shell.searchOpen")}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts="Control+K Meta+K"
    >
      <span className="shell-v2__search-icon" aria-hidden>
        <ShellIconSvg name="search" />
      </span>
      {variant === "field" ? (
        <>
          <span className="shell-v2__search-label">{t("shell.searchPlaceholder")}</span>
          <kbd className="shell-v2__search-kbd">Ctrl+K</kbd>
        </>
      ) : null}
    </button>
  );
}
