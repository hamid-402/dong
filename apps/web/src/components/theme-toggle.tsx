"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  APP_ATMOSPHERES,
  APP_THEMES,
  useOptionalTheme,
} from "@/lib/theme";
import { useShellV2Api } from "@/components/shell/shell-v2-context";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Appearance dialog — دانش‌بان-style theme × background × density. */
export function ThemeToggleButton({ className = "" }: { className?: string }) {
  const themeApi = useOptionalTheme();
  const shell = useShellV2Api();
  const panelId = useId();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [localOpen, setLocalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const open = shell ? shell.appearanceOpen : localOpen;
  const setOpen = shell ? shell.setAppearanceOpen : setLocalOpen;

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
      if (rootRef.current?.contains(target)) return;
      if (dialogRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(focusFirst);
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      (previouslyFocused.current ?? triggerRef.current)?.focus?.();
    };
  }, [open, setOpen]);

  if (!themeApi) return null;

  const {
    theme,
    atmosphere,
    density,
    setTheme,
    setAtmosphere,
    setDensity,
  } = themeApi;
  const activeTheme = APP_THEMES.find((item) => item.id === theme) ?? APP_THEMES[0]!;
  const activeAtm =
    APP_ATMOSPHERES.find((item) => item.id === atmosphere) ?? APP_ATMOSPHERES[0]!;
  const label = `ظاهر: ${activeTheme.label} · ${activeAtm.label}`;

  const dialog =
    open && mounted
      ? createPortal(
          <div className="appearance-portal" ref={dialogRef}>
            <button
              type="button"
              className="appearance-backdrop"
              aria-label="بستن تنظیم ظاهر"
              onClick={() => setOpen(false)}
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
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </header>

              <section>
                <p className="appearance-panel__heading">تم رابط</p>
                <p className="appearance-panel__sub">
                  حالت‌های رسمی دنگ · مستقل از پس‌زمینه
                </p>
                <ul
                  className="appearance-theme-grid appearance-theme-grid--wide"
                  role="list"
                >
                  {APP_THEMES.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          item.id === theme
                            ? "appearance-theme-option is-active"
                            : "appearance-theme-option"
                        }
                        data-theme-preview={item.id}
                        onClick={() => setTheme(item.id)}
                        aria-pressed={item.id === theme}
                      >
                        <span
                          className={`appearance-theme-preview appearance-theme-preview--${item.id}`}
                          aria-hidden
                        />
                        <strong>{item.label}</strong>
                        <small>{item.caption}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <p className="appearance-panel__heading">پس‌زمینهٔ فضای کار</p>
                <p className="appearance-panel__sub">مستقل از تم رابط</p>
                <ul className="appearance-bg-grid" role="list">
                  {APP_ATMOSPHERES.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={
                          item.id === atmosphere
                            ? "appearance-bg-option is-active"
                            : "appearance-bg-option"
                        }
                        data-atmosphere-preview={item.id}
                        onClick={() => setAtmosphere(item.id)}
                        aria-pressed={item.id === atmosphere}
                        title={item.hint}
                      >
                        <span>{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>

              <label className="appearance-density-row">
                <span>
                  <strong>نمای فشرده</strong>
                  <small>تراکم بیشتر برای فهرست‌های حرفه‌ای</small>
                </span>
                <span className="appearance-switch">
                  <input
                    type="checkbox"
                    checked={density === "compact"}
                    onChange={(event) =>
                      setDensity(
                        (event.target.checked
                          ? "compact"
                          : "comfortable"),
                      )
                    }
                    aria-label="نمای فشرده"
                  />
                  <span aria-hidden />
                </span>
              </label>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`appearance-control ${className}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="theme-toggle"
        onClick={() => setOpen(!open)}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
      >
        <span className="theme-toggle__icon" aria-hidden>
          {theme === "light" || theme === "mist" ? "◐" : "◑"}
        </span>
      </button>
      {dialog}
    </div>
  );
}
