"use client";

import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cx } from "./cx.js";

export type ModalProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  open: boolean;
  title: string;
  titleVisible?: boolean;
  describedBy?: string;
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

/** Accessible dialog shell. Focus stays inside until close. */
export function Modal({
  open,
  title,
  titleVisible = true,
  describedBy,
  children,
  onClose,
  className,
  ...rest
}: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = panelRef.current;
    if (panel) {
      const focusable = getFocusable(panel);
      const target = focusable[0] ?? panel;
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
    <div className="dang-modal" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={cx("dang-modal__panel", className)}
        {...rest}
        onClick={(event) => {
          event.stopPropagation();
          rest.onClick?.(event);
        }}
        onKeyDown={(event) => {
          trapTab(event);
          rest.onKeyDown?.(event);
        }}
      >
        <h2 id={titleId} className={titleVisible ? "dang-modal__title" : "dang-sr"}>
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

export function Skeleton({ height = "1rem", width = "100%", className, style, ...rest }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cx("dang-skeleton", className)}
      style={{ height, width, ...style }}
      {...rest}
    />
  );
}
