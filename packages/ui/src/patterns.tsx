"use client";

import { useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { cx } from "./cx.js";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ok" | "warn" | "danger" | "gold" | "info";
  children: ReactNode;
};

const BADGE_TONE: Record<NonNullable<BadgeProps["tone"]>, string | undefined> = {
  neutral: undefined,
  ok: "dang-badge--ok",
  warn: "dang-badge--warn",
  danger: "dang-badge--danger",
  gold: "dang-badge--gold",
  info: "dang-badge--info",
};

export function Badge({ tone = "neutral", children, className, ...rest }: BadgeProps) {
  return (
    <span className={cx("dang-badge", BADGE_TONE[tone], className)} {...rest}>
      {children}
    </span>
  );
}

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  pressed?: boolean;
};

export function Chip({ pressed = false, children, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      className={cx("dang-chip", className)}
      aria-pressed={pressed}
      {...rest}
    >
      {children}
    </button>
  );
}

export type AlertTone = "info" | "success" | "warning" | "danger";

export type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
};

export function Alert({ tone = "info", title, children, className, ...rest }: AlertProps) {
  const role = tone === "danger" || tone === "warning" ? "alert" : "status";
  return (
    <div
      role={role}
      className={cx("dang-alert", tone !== "info" && `dang-alert--${tone}`, className)}
      {...rest}
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export const Callout = Alert;

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="dang-empty" role="status">
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export type TabsProps = {
  items: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
  "aria-label"?: string;
};

export function Tabs({ items, value, onChange, "aria-label": ariaLabel }: TabsProps) {
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );

  const move = (nextIndex: number) => {
    const count = items.length;
    if (count === 0) return;
    const wrapped = (nextIndex + count) % count;
    const next = items[wrapped];
    if (next) onChange(next.id);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="dang-tabs"
      onKeyDown={(event) => {
        const rtl = document.documentElement.dir === "rtl";
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          move(selectedIndex + (rtl ? 1 : -1));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          move(selectedIndex + (rtl ? -1 : 1));
        } else if (event.key === "Home") {
          event.preventDefault();
          move(0);
        } else if (event.key === "End") {
          event.preventDefault();
          move(items.length - 1);
        }
      }}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`dang-tab-${item.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className="dang-tab"
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export type TableProps = {
  caption?: string;
  headers: string[];
  rows: ReactNode[][];
};

export function Table({ caption, headers, rows }: TableProps) {
  return (
    <div className="dang-table-wrap">
      <table className="dang-table">
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ToastTone = "success" | "error" | "info" | "warning";

export type ToastProps = {
  tone?: ToastTone;
  children: ReactNode;
  onDismiss?: () => void;
} & HTMLAttributes<HTMLDivElement>;

const TOAST_TONE: Record<ToastTone, string | undefined> = {
  info: undefined,
  success: "dang-toast--success",
  error: "dang-toast--error",
  warning: "dang-toast--warning",
};

/** Live region toast. Pass onDismiss for a manual close control. */
export function Toast({ tone = "info", children, onDismiss, className, ...rest }: ToastProps) {
  const role = tone === "error" || tone === "warning" ? "alert" : "status";
  return (
    <div
      role={role}
      className={cx("dang-toast", TOAST_TONE[tone], className)}
      {...rest}
    >
      <div className="dang-toast__body">{children}</div>
      {onDismiss ? (
        <button type="button" className="dang-toast__close" onClick={onDismiss}>
          بستن
        </button>
      ) : null}
    </div>
  );
}

export type ToastItem = {
  id: string;
  tone?: ToastTone;
  message: ReactNode;
};

export function ToastRegion({
  items,
  onDismiss,
  label = "اعلان‌ها",
}: {
  items: ToastItem[];
  onDismiss?: (id: string) => void;
  label?: string;
}) {
  return (
    <div className="dang-toast-region" aria-live="polite" aria-label={label}>
      {items.map((item) => (
        <Toast
          key={item.id}
          tone={item.tone}
          onDismiss={onDismiss ? () => onDismiss(item.id) : undefined}
        >
          {item.message}
        </Toast>
      ))}
    </div>
  );
}

export type ToastInput = {
  tone?: ToastTone;
  message: ReactNode;
};

/** Queued toasts with manual dismiss. Success items leave after four seconds. */
export function useToastQueue() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  };

  const push = (input: ToastInput) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setItems((current) => [...current, { id, tone: input.tone ?? "info", message: input.message }]);
    if (input.tone !== "error" && input.tone !== "warning") {
      window.setTimeout(() => dismiss(id), 4000);
    }
    return id;
  };

  return { items, push, dismiss };
}
