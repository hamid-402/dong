"use client";

import type { HTMLAttributes } from "react";
import { cx } from "./cx.js";
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
  className,
  style,
  ...rest
}: AmountProps) {
  const contextUnit = useDisplayUnit();
  const displayUnit = displayUnitProp ?? contextUnit;
  const formatted =
    irrMinor !== undefined
      ? formatMoneyFromIrrMinor(irrMinor, displayUnit)
      : formatMoney(toman ?? 0, displayUnit);

  return (
    <span className={cx("dang-amount", className)} dir="ltr" style={style} {...rest}>
      {formatted}
      {showUnit ? (
        <i className="dang-amount__unit" dir="rtl">
          {displayUnitLabel(displayUnit)}
        </i>
      ) : null}
    </span>
  );
}
