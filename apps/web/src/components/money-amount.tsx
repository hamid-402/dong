"use client";

import { Amount, type AmountProps } from "@dang/ui";
import { useDisplayUnit } from "@/lib/display-unit";

/** Amount that follows the resolved user/workspace display unit (S11-05). */
export function MoneyAmount(props: Omit<AmountProps, "displayUnit">) {
  const unit = useDisplayUnit();
  return <Amount {...props} displayUnit={unit} />;
}
