"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type ModalProps = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose?: () => void;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true",
  );
}

/** Accessible dialog shell for forms (not decorative card chrome). */
export function Modal({ open, title, children, onClose, style, ...rest }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    if (panel) {
      const focusable = getFocusable(panel);
      const target = focusable[0] ?? titleRef.current ?? panel;
      target.focus();
    }

    return () => {
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === "function") {
        previous.focus();
      }
      previousFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !onClose) return;

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const backdrop: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "color-mix(in srgb, var(--dang-ink, #111) 45%, transparent)",
    display: "grid",
    placeItems: "center",
    padding: "var(--dang-space-4, 16px)",
    zIndex: 40,
  };
  const panel: CSSProperties = {
    width: "min(100%, 28rem)",
    background: "var(--dang-surface, #fff)",
    color: "var(--dang-ink, #111)",
    border: "1px solid var(--dang-line, #ddd)",
    borderRadius: "var(--dang-radius-lg, 16px)",
    padding: "var(--dang-space-5, 24px)",
    boxShadow: "var(--dang-elev-2, 0 8px 24px rgba(0,0,0,.12))",
    ...style,
  };

  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !panelRef.current) return;

    const focusable = getFocusable(panelRef.current);
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }

    const active = document.activeElement;
    const onFocusable = active instanceof HTMLElement && focusable.includes(active);

    if (event.shiftKey) {
      if (!onFocusable || active === first) {
        event.preventDefault();
        last.focus();
      }
    } else if (!onFocusable || active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div style={backdrop} role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={panel}
        {...rest}
        onClick={(e) => {
          e.stopPropagation();
          rest.onClick?.(e);
        }}
        onKeyDown={(e) => {
          trapTab(e);
          rest.onKeyDown?.(e);
        }}
      >
        <h2
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          style={{ margin: "0 0 1rem", fontSize: "1.125rem", outline: "none" }}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  height?: number | string;
  width?: number | string;
};

export function Skeleton({ height = "1rem", width = "100%", style, ...rest }: SkeletonProps) {
  const skeletonStyle: CSSProperties = {
    height,
    width,
    borderRadius: "var(--dang-radius-sm, 8px)",
    background:
      "linear-gradient(90deg, color-mix(in srgb, var(--dang-line, #ddd) 70%, transparent), color-mix(in srgb, var(--dang-line, #ddd) 35%, transparent), color-mix(in srgb, var(--dang-line, #ddd) 70%, transparent))",
    backgroundSize: "200% 100%",
    animation: "dang-skeleton 1.2s ease-in-out infinite",
    ...style,
  };
  return <div aria-hidden style={skeletonStyle} {...rest} />;
}
