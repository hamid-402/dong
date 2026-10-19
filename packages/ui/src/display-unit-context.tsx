"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DisplayUnit } from "./format.js";

const DisplayUnitContext = createContext<DisplayUnit>("toman");

/** Provides the effective display unit for Amount / MoneyInput defaults. */
export function DisplayUnitProvider({
  unit,
  children,
}: {
  unit: DisplayUnit;
  children: ReactNode;
}) {
  return (
    <DisplayUnitContext.Provider value={unit}>{children}</DisplayUnitContext.Provider>
  );
}

/** Resolved unit from nearest DisplayUnitProvider, else تومان. */
export function useDisplayUnit(): DisplayUnit {
  return useContext(DisplayUnitContext);
}
