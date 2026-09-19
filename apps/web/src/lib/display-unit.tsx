"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  resolveDisplayUnit,
  type DisplayUnit,
  type DisplayUnitPreference,
} from "@dang/contracts";

type DisplayUnitContextValue = {
  unit: DisplayUnit;
  /** User preference only (may be null = follow workspace). */
  userPreference: DisplayUnitPreference | null;
  workspaceUnit: DisplayUnit | null;
};

const DisplayUnitContext = createContext<DisplayUnitContextValue>({
  unit: "rial",
  userPreference: null,
  workspaceUnit: null,
});

export function DisplayUnitProvider({
  userPreference = null,
  workspaceUnit = null,
  children,
}: {
  userPreference?: DisplayUnitPreference | null;
  workspaceUnit?: DisplayUnit | null;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      unit: resolveDisplayUnit(userPreference, workspaceUnit),
      userPreference: userPreference ?? null,
      workspaceUnit: workspaceUnit ?? null,
    }),
    [userPreference, workspaceUnit],
  );
  return (
    <DisplayUnitContext.Provider value={value}>{children}</DisplayUnitContext.Provider>
  );
}

export function useDisplayUnit(): DisplayUnit {
  return useContext(DisplayUnitContext).unit;
}

export function useDisplayUnitContext(): DisplayUnitContextValue {
  return useContext(DisplayUnitContext);
}
