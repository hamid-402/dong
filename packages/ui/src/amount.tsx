import type { CSSProperties, HTMLAttributes } from "react";
import { formatToman, formatTomanFromIrrMinor } from "./format.js";

export type AmountProps = HTMLAttributes<HTMLSpanElement> & {
  /** Amount in تومان (display unit). */
  toman?: number;
  /** Canonical minor IRR units as string/number. */
  irrMinor?: string | number;
  showUnit?: boolean;
};

export function Amount({
  toman,
  irrMinor,
  showUnit = true,
  style,
  ...rest
}: AmountProps) {
  const formatted =
    irrMinor !== undefined
      ? formatTomanFromIrrMinor(irrMinor)
      : formatToman(toman ?? 0);

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
          تومان
        </i>
      ) : null}
    </span>
  );
}
