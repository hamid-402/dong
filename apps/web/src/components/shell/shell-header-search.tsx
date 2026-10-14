"use client";

import { ShellIconSvg } from "@/components/shell/shell-icons";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import { t } from "@/lib/i18n";

/** Header search — icon button that opens the command palette. */
export function ShellHeaderSearchField() {
  const shell = useShellV2Api();
  const open = shell?.commandPaletteOpen ?? false;

  return (
    <button
      type="button"
      className="shell-v2__search"
      onClick={() => shell?.openCommandPalette()}
      title={t("shell.searchTitle")}
      aria-label={t("shell.searchOpen")}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts="Control+K Meta+K"
    >
      <ShellIconSvg name="search" size={20} />
    </button>
  );
}
