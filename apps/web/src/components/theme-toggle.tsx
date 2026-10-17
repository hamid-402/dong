"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { APP_THEMES, useOptionalTheme } from "@/lib/theme";
import { AppearanceFields } from "@/components/appearance-fields";
import { useShellV2Api } from "@/components/shell/shell-v2-context";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Stable id so the profile menu can point at the shell-level dialog. */
export const SHELL_APPEARANCE_DIALOG_ID = "shell-appearance-dialog";

/**
 * Appearance dialog portal. Lives outside the profile menu so choosing a theme
 * is not cancelled by the menu's outside-mousedown close.
 */
export function AppearanceDialogSurface({
  open,
  onClose,
  panelId,
  returnFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  panelId: string;
  returnFocusRef?: { current: HTMLElement | null };
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  useBodyScrollLock(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const focusFirst = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      first?.focus();
    }, 0);

    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dialogRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointer);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(focusFirst);
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      (previouslyFocused.current ?? returnFocusRef?.current)?.focus?.();
    };
  }, [open, onClose, returnFocusRef]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="appearance-portal" ref={dialogRef}>
      <button
        type="button"
        className="appearance-backdrop"
        aria-label="بستن تنظیم ظاهر"
        onClick={onClose}
      />
      <div
        id={panelId}
        ref={panelRef}
        className="appearance-panel appearance-panel--dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="appearance-panel__head">
          <div>
            <p className="appearance-panel__eyebrow">شخصی‌سازی</p>
            <h2 id={titleId} className="appearance-panel__title">
              تنظیم ظاهر
            </h2>
          </div>
          <button
            type="button"
            className="appearance-panel__close"
            aria-label="بستن"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <AppearanceFields />
      </div>
    </div>,
    document.body,
  );
}

/** Shell-level appearance dialog — one instance, independent of the profile menu. */
export function AppearanceDialog() {
  const themeApi = useOptionalTheme();
  const shell = useShellV2Api();
  const onClose = useCallback(() => {
    shell?.setAppearanceOpen(false);
  }, [shell]);

  if (!themeApi || !shell) return null;

  return (
    <AppearanceDialogSurface
      open={shell.appearanceOpen}
      onClose={onClose}
      panelId={SHELL_APPEARANCE_DIALOG_ID}
    />
  );
}

/** Appearance control for surfaces outside the product shell (marketing). */
export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const themeApi = useOptionalTheme();
  const shell = useShellV2Api();
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const closeLocal = useCallback(() => setLocalOpen(false), []);

  const open = shell ? shell.appearanceOpen : localOpen;
  const setOpen = shell ? shell.setAppearanceOpen : setLocalOpen;
  const dialogId = shell ? SHELL_APPEARANCE_DIALOG_ID : panelId;

  if (!themeApi) return null;

  const { theme } = themeApi;
  const activeTheme = APP_THEMES.find((item) => item.id === theme) ?? APP_THEMES[0]!;
  const label = `ظاهر: ${activeTheme.label}`;

  return (
    <div className={`appearance-control ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className="theme-toggle"
        onClick={() => setOpen(!open)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={dialogId}
      >
        <span
          className="theme-toggle__icon"
          style={{ background: activeTheme.swatch }}
          aria-hidden
        />
      </button>
      {shell ? null : (
        <AppearanceDialogSurface
          open={localOpen}
          onClose={closeLocal}
          panelId={panelId}
          returnFocusRef={triggerRef}
        />
      )}
    </div>
  );
}
