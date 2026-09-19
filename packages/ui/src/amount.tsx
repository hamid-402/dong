import type { CSSProperties, HTMLAttributes } from "react";
import {
  displayUnitLabel,
  formatMoney,
  formatMoneyFromIrrMinor,
  type DisplayUnit,
} from "./format.js";

export type AmountProps = HTMLAttributes<HTMLSpanElement> & {
  /**
   * @deprecated Prefer irrMinor. Value is interpreted in `displayUnit`
   * (default rial). Legacy callers that passed تومان should set displayUnit="toman".
   */
  toman?: number;
  /** Canonical minor IRR units as string/number. */
  irrMinor?: string | number;
  /** Effective display unit — defaults to rial (S11-05). */
  displayUnit?: DisplayUnit;
  showUnit?: boolean;
};

export function Amount({
  toman,
  irrMinor,
  displayUnit = "rial",
  showUnit = true,
  style,
  ...rest
}: AmountProps) {
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
