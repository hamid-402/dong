"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "ok" | "warn" | "danger" | "gold";
  children: ReactNode;
};

export function Badge({ tone = "neutral", children, style, ...rest }: BadgeProps) {
  const colors: Record<NonNullable<BadgeProps["tone"]>, string> = {
    neutral: "var(--dang-muted)",
    ok: "var(--dang-success)",
    warn: "var(--dang-warning)",
    danger: "var(--dang-danger)",
    gold: "var(--dang-gold)",
  };
  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 28,
    padding: "2px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    color: colors[tone],
    background: `color-mix(in srgb, ${colors[tone]} 14%, transparent)`,
    border: `1px solid color-mix(in srgb, ${colors[tone]} 28%, transparent)`,
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
      <strong style={{ fontSize: 15 }}>{title}</strong>
      {description ? (
        <p style={{ margin: 0, color: "var(--dang-muted)", fontSize: 14, lineHeight: 1.6 }}>
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
                ? "1px solid color-mix(in srgb, var(--dang-primary) 45%, var(--dang-line))"
                : "1px solid var(--dang-line)",
              background: selected
                ? "color-mix(in srgb, var(--dang-primary) 12%, transparent)"
                : "transparent",
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
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
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
  const color =
    tone === "error"
      ? "var(--dang-danger)"
      : tone === "success"
        ? "var(--dang-success)"
        : "var(--dang-primary)";
  return (
    <div
      role={role}
      aria-live={tone === "error" ? "assertive" : "polite"}
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid color-mix(in srgb, ${color} 35%, var(--dang-line))`,
        background: `color-mix(in srgb, ${color} 10%, var(--dang-surface))`,
        color: "inherit",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
