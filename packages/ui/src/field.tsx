"use client";

import {
  useId,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

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

const hintStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--dang-muted)",
};

const errorStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--dang-danger)",
};

const requiredMarkStyle: CSSProperties = {
  color: "var(--dang-danger)",
};

function describedBy(...ids: Array<string | undefined>): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

function FieldLabel({ label, required }: { label: ReactNode; required?: boolean }) {
  return (
    <span style={labelStyle}>
      {label}
      {required ? (
        <span style={requiredMarkStyle} aria-hidden="true">
          {" *"}
        </span>
      ) : null}
    </span>
  );
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function TextField({
  label,
  hint,
  error,
  required,
  id,
  style,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const invalid = Boolean(error);

  return (
    <label style={fieldWrap} htmlFor={inputId}>
      <FieldLabel label={label} required={required} />
      <input
        {...rest}
        id={inputId}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(hintId, errorId, ariaDescribedBy)}
        style={{
          ...controlStyle,
          ...(invalid ? { borderColor: "var(--dang-danger)" } : null),
          ...style,
        }}
      />
      {hint ? (
        <span id={hintId} style={hintStyle}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" style={errorStyle}>
          {error}
        </span>
      ) : null}
    </label>
  );
}

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function SelectField({
  label,
  hint,
  error,
  required,
  id,
  style,
  children,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: SelectFieldProps) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const invalid = Boolean(error);

  return (
    <label style={fieldWrap} htmlFor={selectId}>
      <FieldLabel label={label} required={required} />
      <select
        {...rest}
        id={selectId}
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy(hintId, errorId, ariaDescribedBy)}
        style={{
          ...controlStyle,
          ...(invalid ? { borderColor: "var(--dang-danger)" } : null),
          ...style,
        }}
      >
        {children}
      </select>
      {hint ? (
        <span id={hintId} style={hintStyle}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} role="alert" style={errorStyle}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
