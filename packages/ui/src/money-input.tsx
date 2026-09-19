"use client";

import type { InputHTMLAttributes } from "react";
import { displayUnitLabel, type DisplayUnit } from "./format.js";

export type MoneyInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & {
  /** Display-unit integer as string (digits only). */
  value: string;
  onValueChange: (next: string) => void;
  displayUnit?: DisplayUnit;
  label?: string;
  hint?: string;
  error?: string;
};

/**
 * Amount entry in the active display unit. Callers convert to IRR minor via
 * displayIntegerToIrrMinor before sending to the API.
 */
export function MoneyInput({
  value,
  onValueChange,
  displayUnit = "rial",
  label,
  hint,
  error,
  id,
  disabled,
  ...rest
}: MoneyInputProps) {
  const fieldId = id ?? "money-input";
  return (
    <label style={{ display: "grid", gap: 6 }}>
      {label ? (
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {label}
          <span style={{ marginInlineStart: 6, opacity: 0.7, fontWeight: 500 }}>
            ({displayUnitLabel(displayUnit)})
          </span>
        </span>
      ) : null}
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          {...rest}
          id={fieldId}
          type="text"
          inputMode="numeric"
          dir="ltr"
          disabled={disabled}
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            const digits = event.target.value.replace(/[^\d]/g, "");
            onValueChange(digits);
          }}
          style={{
            flex: 1,
            fontVariantNumeric: "tabular-nums",
            ...(typeof rest.style === "object" && rest.style ? rest.style : {}),
          }}
        />
        <span aria-hidden style={{ opacity: 0.75, whiteSpace: "nowrap" }}>
          {displayUnitLabel(displayUnit)}
        </span>
      </span>
      {hint && !error ? (
        <span style={{ fontSize: 12, opacity: 0.7 }}>{hint}</span>
      ) : null}
      {error ? (
        <span style={{ fontSize: 12, color: "var(--danger, #b91c1c)" }}>{error}</span>
      ) : null}
    </label>
  );
}
