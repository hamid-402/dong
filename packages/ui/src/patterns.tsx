"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ok" | "warn" | "danger" | "gold";
  children: ReactNode;
};

export function Badge({ tone = "neutral", children, style, ...rest }: BadgeProps) {
  const tones: Record<NonNullable<BadgeProps["tone"]>, { color: string; background: string; border: string }> = {
    neutral: {
      color: "var(--dang-muted)",
      background: "var(--dang-fill-soft)",
      border: "var(--dang-line)",
    },
    ok: {
      color: "var(--dang-success)",
      background: "var(--dang-success-soft)",
      border: "var(--dang-success-line)",
    },
    warn: {
      color: "var(--dang-warning)",
      background: "var(--dang-warning-soft)",
      border: "var(--dang-warning-line)",
    },
    danger: {
      color: "var(--dang-danger)",
      background: "var(--dang-danger-soft)",
      border: "var(--dang-danger-line)",
    },
    gold: {
      color: "var(--dang-gold)",
      background: "var(--dang-gold-soft)",
      border: "var(--dang-gold-line)",
    },
  };
  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: "0.875rem",
    fontWeight: 600,
    color: tones[tone].color,
    background: tones[tone].background,
    border: `1px solid ${tones[tone].border}`,
    ...style,
  };
  return (
    <span style={badgeStyle} {...rest}>
      {children}
    </span>
  );
}

export type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div
      className="dang-empty-state"
      role="status"
      style={{
        display: "grid",
        gap: 10,
        padding: "20px 16px",
        borderRadius: 12,
        border: "1px dashed var(--dang-line)",
        background: "var(--dang-surface-2, var(--dang-surface))",
        textAlign: "start",
      }}
    >
      <strong style={{ fontSize: "0.9375rem" }}>{title}</strong>
      {description ? (
        <p style={{ margin: 0, color: "var(--dang-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>
          {description}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
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
  return (
    <div role="tablist" aria-label={ariaLabel} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            style={{
              minHeight: 48,
              minWidth: 48,
              padding: "8px 14px",
              borderRadius: 10,
              border: selected
                ? "1px solid var(--dang-primary-line)"
                : "1px solid var(--dang-line)",
              background: selected ? "var(--dang-primary-soft)" : "transparent",
              color: "inherit",
              font: "inherit",
              fontWeight: selected ? 700 : 500,
              cursor: "pointer",
            }}
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
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        {caption ? <caption style={{ textAlign: "start", marginBottom: 8 }}>{caption}</caption> : null}
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                style={{
                  textAlign: "start",
                  padding: "10px 8px",
                  borderBottom: "1px solid var(--dang-line)",
                  color: "var(--dang-muted)",
                  fontWeight: 600,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  style={{
                    padding: "12px 8px",
                    borderBottom: "1px solid var(--dang-line)",
                    minHeight: 48,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type ToastProps = {
  tone?: "success" | "error" | "info";
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/** Live region toast — use for flash success/error. */
export function Toast({ tone = "info", children, style, ...rest }: ToastProps) {
  const role = tone === "error" ? "alert" : "status";
  const surface =
    tone === "error"
      ? { background: "var(--dang-danger-soft)", border: "var(--dang-danger-line)" }
      : tone === "success"
        ? { background: "var(--dang-success-soft)", border: "var(--dang-success-line)" }
        : { background: "var(--dang-info-soft)", border: "var(--dang-info-line)" };
  return (
    <div
      role={role}
      aria-live={tone === "error" ? "assertive" : "polite"}
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${surface.border}`,
        background: surface.background,
        color: "inherit",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
