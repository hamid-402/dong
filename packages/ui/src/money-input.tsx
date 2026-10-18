"use client";

import type { InputHTMLAttributes } from "react";
import { displayUnitLabel, formatMoney, latinDigits, type DisplayUnit } from "./format.js";
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
  const { className, ...inputRest } = rest;
  const formatted =
    value.trim() !== "" ? `${formatMoney(value, displayUnit)} ${displayUnitLabel(displayUnit)}` : "";
  return (
    <div className="dang-field">
      {label ? (
        <label className="dang-label" htmlFor={fieldId}>
          {label}
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
            const digits = latinDigits(event.target.value).replace(/[^\d]/g, "");
            onValueChange(digits);
          }}
          className={cx("dang-control", "dang-money-input", className)}
        />
        <span aria-hidden className="dang-field__hint">
          {displayUnitLabel(displayUnit)}
        </span>
      </span>
      {formatted && !error ? <span className="dang-field__hint">{formatted}</span> : null}
      {hint && !error && !formatted ? <span className="dang-field__hint">{hint}</span> : null}
      {error ? (
        <span className="dang-field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
