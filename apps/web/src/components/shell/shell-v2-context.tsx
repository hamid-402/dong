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
  appearanceOpen: boolean;
  setAppearanceOpen: Dispatch<SetStateAction<boolean>>;
  notificationsOpen: boolean;
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>;
};

const ShellV2Context = createContext<ShellV2ContextValue | null>(null);

/** Marks descendants as living inside the unified product shell (Phase 1). */
export function ShellV2Provider({ children }: { children: ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpenRaw] = useState(false);
  const [appearanceOpen, setAppearanceOpenRaw] = useState(false);
  const [notificationsOpen, setNotificationsOpenRaw] = useState(false);

  const setCommandPaletteOpen = useCallback((value: SetStateAction<boolean>) => {
    setCommandPaletteOpenRaw((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (next) {
        setAppearanceOpenRaw(false);
        setNotificationsOpenRaw(false);
      }
      return next;
    });
  }, []);

  const setAppearanceOpen = useCallback((value: SetStateAction<boolean>) => {
    setAppearanceOpenRaw((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (next) {
        setCommandPaletteOpenRaw(false);
        setNotificationsOpenRaw(false);
      }
      return next;
    });
  }, []);

  const setNotificationsOpen = useCallback((value: SetStateAction<boolean>) => {
    setNotificationsOpenRaw((prev) => {
      const next = typeof value === "function" ? value(prev) : value;
      if (next) {
        setCommandPaletteOpenRaw(false);
        setAppearanceOpenRaw(false);
      }
      return next;
    });
  }, []);

  const openCommandPalette = useCallback(() => {
    setCommandPaletteOpen(true);
  }, [setCommandPaletteOpen]);

  const value = useMemo(
    () => ({
      openCommandPalette,
      commandPaletteOpen,
      setCommandPaletteOpen,
      appearanceOpen,
      setAppearanceOpen,
      notificationsOpen,
      setNotificationsOpen,
    }),
    [
      openCommandPalette,
      commandPaletteOpen,
      setCommandPaletteOpen,
      appearanceOpen,
      setAppearanceOpen,
      notificationsOpen,
      setNotificationsOpen,
    ],
  );
  return <ShellV2Context.Provider value={value}>{children}</ShellV2Context.Provider>;
}

export function useShellV2(): boolean {
  return useContext(ShellV2Context) !== null;
}

export function useShellV2Api(): ShellV2ContextValue | null {
  return useContext(ShellV2Context);
}
