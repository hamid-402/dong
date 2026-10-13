"use client";

import type { InputHTMLAttributes } from "react";
import { displayUnitLabel, type DisplayUnit } from "./format.js";
import { useDisplayUnit } from "./display-unit-context.js";
import { cx } from "./cx.js";

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
  displayUnit: displayUnitProp,
  label,
  hint,
  error,
  id,
  disabled,
  ...rest
}: MoneyInputProps) {
  const contextUnit = useDisplayUnit();
  const displayUnit = displayUnitProp ?? contextUnit;
  const fieldId = id ?? "money-input";
  const { className, style, ...inputRest } = rest;
  return (
    <div className="dang-field">
      {label ? (
        <label className="dang-label" htmlFor={fieldId}>
          {label}
          <span> ({displayUnitLabel(displayUnit)})</span>
        </label>
      ) : null}
      <span className="dang-password">
        <input
          {...inputRest}
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
          className={cx("dang-control", className)}
          style={{ ...style, fontVariantNumeric: "tabular-nums" }}
        />
        <span aria-hidden className="dang-field__hint">
          {displayUnitLabel(displayUnit)}
        </span>
      </span>
      {hint && !error ? <span className="dang-field__hint">{hint}</span> : null}
      {error ? (
        <span className="dang-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
