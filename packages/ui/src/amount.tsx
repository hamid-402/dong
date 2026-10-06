"use client";

import type { CSSProperties, HTMLAttributes } from "react";
import {
  displayUnitLabel,
  formatMoney,
  formatMoneyFromIrrMinor,
  type DisplayUnit,
} from "./format.js";
import { useDisplayUnit } from "./display-unit-context.js";

export type AmountProps = HTMLAttributes<HTMLSpanElement> & {
  /**
   * @deprecated Prefer irrMinor. Value is interpreted in `displayUnit`
   * (context or explicit prop). Legacy callers that passed تومان integers
   * should set displayUnit="toman" or pass irrMinor instead.
   */
  toman?: number;
  /** Canonical minor IRR units as string/number. */
  irrMinor?: string | number;
  /**
   * Effective display unit. When omitted, uses DisplayUnitProvider context
   * (default rial when no provider).
   */
  displayUnit?: DisplayUnit;
  showUnit?: boolean;
};

export function Amount({
  toman,
  irrMinor,
  displayUnit: displayUnitProp,
  showUnit = true,
  style,
  ...rest
}: AmountProps) {
  const contextUnit = useDisplayUnit();
  const displayUnit = displayUnitProp ?? contextUnit;
  const formatted =
    irrMinor !== undefined
      ? formatMoneyFromIrrMinor(irrMinor, displayUnit)
      : formatMoney(toman ?? 0, displayUnit);

  const amountStyle: CSSProperties = {
    fontVariantNumeric: "tabular-nums",
    fontWeight: 700,
    letterSpacing: "0.01em",
    ...style,
  };

  return (
    <span style={amountStyle} dir="ltr" {...rest}>
      {formatted}
      {showUnit ? (
        <i
          style={{ fontStyle: "normal", fontWeight: 500, marginInlineStart: 6, opacity: 0.8 }}
          dir="rtl"
        >
          {displayUnitLabel(displayUnit)}
        </i>
      ) : null}
    </span>
  );
}
