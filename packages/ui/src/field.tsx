"use client";

import { useId, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--dang-muted)",
};

const controlStyle: CSSProperties = {
  border: "1px solid var(--dang-line)",
  background: "var(--dang-surface-2)",
  color: "var(--dang-text)",
  borderRadius: "var(--dang-radius-md, 12px)",
  padding: "12px 14px",
  minHeight: "var(--dang-control-h, 48px)",
  font: "inherit",
  fontSize: 15,
  width: "100%",
};

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
};

export function TextField({ label, hint, id, style, ...rest }: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label style={fieldWrap} htmlFor={inputId}>
      <span style={labelStyle}>{label}</span>
      <input
        id={inputId}
        style={{ ...controlStyle, ...style }}
        {...rest}
      />
      {hint ? (
        <span style={{ fontSize: 12, color: "var(--dang-muted)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
};

export function SelectField({ label, hint, id, style, children, ...rest }: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <label style={fieldWrap} htmlFor={selectId}>
      <span style={labelStyle}>{label}</span>
      <select id={selectId} style={{ ...controlStyle, ...style }} {...rest}>
        {children}
      </select>
      {hint ? (
        <span style={{ fontSize: 12, color: "var(--dang-muted)" }}>{hint}</span>
      ) : null}
    </label>
  );
}
