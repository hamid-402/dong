import type { CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

const fieldWrap: CSSProperties = {
  display: "grid",
  gap: 6,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: "var(--dang-muted, #9eaaa6)",
};

const controlStyle: CSSProperties = {
  border: "1px solid var(--dang-line, rgba(220,229,225,.11))",
  background: "var(--dang-surface-2, #16211e)",
  color: "var(--dang-text, #f3f1e9)",
  borderRadius: 12,
  padding: "12px 14px",
  font: "inherit",
  width: "100%",
};

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
};

export function TextField({ label, hint, id, style, ...rest }: TextFieldProps) {
  const inputId = id ?? (typeof label === "string" ? label : undefined);
  return (
    <label style={fieldWrap} htmlFor={inputId}>
      <span style={labelStyle}>{label}</span>
      <input id={inputId} style={{ ...controlStyle, ...style }} {...rest} />
      {hint ? (
        <span style={{ fontSize: 12, color: "var(--dang-muted, #9eaaa6)" }}>{hint}</span>
      ) : null}
    </label>
  );
}

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  children: ReactNode;
};

export function SelectField({ label, id, style, children, ...rest }: SelectFieldProps) {
  const selectId = id ?? (typeof label === "string" ? label : undefined);
  return (
    <label style={fieldWrap} htmlFor={selectId}>
      <span style={labelStyle}>{label}</span>
      <select id={selectId} style={{ ...controlStyle, ...style }} {...rest}>
        {children}
      </select>
    </label>
  );
}
