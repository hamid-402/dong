"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

type ShellV2ContextValue = {
  openCommandPalette: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
};

const ShellV2Context = createContext<ShellV2ContextValue | null>(null);

/** Marks descendants as living inside the unified product shell (Phase 1). */
export function ShellV2Provider({ children }: { children: ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const value = useMemo(
    () => ({
      openCommandPalette,
      commandPaletteOpen,
      setCommandPaletteOpen,
    }),
    [openCommandPalette, commandPaletteOpen],
  );
  return <ShellV2Context.Provider value={value}>{children}</ShellV2Context.Provider>;
}

export function useShellV2(): boolean {
  return useContext(ShellV2Context) !== null;
}

export function useShellV2Api(): ShellV2ContextValue | null {
  return useContext(ShellV2Context);
}
