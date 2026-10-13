"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  APP_MOTIONS,
  effectiveMotion,
  isAppMotion,
  motionAllowsAmbient,
  motionAllowsFeedback,
  motionAllowsNarrative,
  type AppMotion,
} from "@/lib/motion-levels";

export type { AppMotion };
export { APP_MOTIONS, isAppMotion };

/** Product themes. Retired ids (dusk, mist, linear) migrate to light. */
export type AppTheme = "light" | "dark";

/** UI density — compact stays available and must not shrink controls under 44px. */
export type AppDensity = "comfortable" | "compact";

const THEME_KEY = "dang-theme";
const ATMOSPHERE_KEY = "dang-atmosphere";
const DENSITY_KEY = "dang-density";
const MOTION_KEY = "dang-motion";

export const APP_THEMES: ReadonlyArray<{
  id: AppTheme;
  label: string;
  caption: string;
  swatch: string;
}> = [
  { id: "light", label: "روشن", caption: "کاغذ گرم", swatch: "#F7F4EE" },
  { id: "dark", label: "تیره", caption: "شب آرام", swatch: "#121614" },
];

export const APP_DENSITIES: ReadonlyArray<{
  id: AppDensity;
  label: string;
  hint: string;
}> = [
  { id: "comfortable", label: "راحت", hint: "فاصلهٔ استاندارد لمسی" },
  { id: "compact", label: "فشرده", hint: "فهرست‌ها کمی جمع‌تر؛ کنترل‌ها حداقل ۴۴" },
];

const THEME_COLORS: Record<AppTheme, string> = {
  light: "#F7F4EE",
  dark: "#121614",
};

type ThemeContextValue = {
  theme: AppTheme;
  density: AppDensity;
  /** User preference (may be overridden by OS reduced-motion). */
  motion: AppMotion;
  /** Effective level after OS clamp — drive UI from this. */
  motionEffective: AppMotion;
  allowsAmbient: boolean;
  allowsFeedback: boolean;
  allowsNarrative: boolean;
  setTheme: (theme: AppTheme) => void;
  setDensity: (density: AppDensity) => void;
  setMotion: (motion: AppMotion) => void;
  /** Cycles light ↔ dark. */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function isAppTheme(value: string | null | undefined): value is AppTheme {
  return value === "dark" || value === "light";
}

/**
 * Keep an explicit dark preference. Every other stored value — including
 * retired dusk, mist, and linear — becomes the light default.
 * Must stay in lockstep with the boot script in `app/layout.tsx`.
 */
export function migrateStoredTheme(raw: string | null | undefined): AppTheme {
  return raw === "dark" ? "dark" : "light";
}

export function isAppDensity(
  value: string | null | undefined,
): value is AppDensity {
  return value === "comfortable" || value === "compact";
}

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "light";
  try {
    const raw = localStorage.getItem(THEME_KEY);
    const next = migrateStoredTheme(raw);
    if (raw && raw !== next) localStorage.setItem(THEME_KEY, next);
    return next;
  } catch {
    return "light";
  }
}

function readStoredDensity(): AppDensity {
  if (typeof window === "undefined") return "comfortable";
  try {
    const raw = localStorage.getItem(DENSITY_KEY);
    if (isAppDensity(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "comfortable";
}

function readStoredMotion(): AppMotion {
  if (typeof window === "undefined") return "full";
  try {
    const raw = localStorage.getItem(MOTION_KEY);
    if (isAppMotion(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "full";
}

function applyAppearance(
  theme: AppTheme,
  density: AppDensity,
  motion: AppMotion,
) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.removeAttribute("data-atmosphere");
  root.setAttribute("data-density", density);
  root.setAttribute("data-motion", motion);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.removeItem(ATMOSPHERE_KEY);
  } catch {
    /* ignore */
  }
}

/** Persists theme + density + motion on <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("light");
  const [density, setDensityState] = useState<AppDensity>("comfortable");
  const [motion, setMotionState] = useState<AppMotion>("full");
  const [osReduced, setOsReduced] = useState(false);
  const [ready, setReady] = useState(false);
  const themeRef = useRef(theme);
  const densityRef = useRef(density);
  const motionRef = useRef(motion);
  useEffect(() => {
    themeRef.current = theme;
    densityRef.current = density;
    motionRef.current = motion;
  }, [theme, density, motion]);

  const motionEffective = effectiveMotion(motion, osReduced);

  useEffect(() => {
    const nextTheme = readStoredTheme();
    const nextDensity = readStoredDensity();
    const nextMotion = readStoredMotion();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(mq.matches);
    setThemeState(nextTheme);
    setDensityState(nextDensity);
    setMotionState(nextMotion);
    setReady(true);
    applyAppearance(
      nextTheme,
      nextDensity,
      effectiveMotion(nextMotion, mq.matches),
    );
    const onChange = () => {
      setOsReduced(mq.matches);
      applyAppearance(
        themeRef.current,
        densityRef.current,
        effectiveMotion(motionRef.current, mq.matches),
      );
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!ready) return;
    applyAppearance(theme, density, motionEffective);
  }, [theme, density, motionEffective, ready]);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setDensity = useCallback((next: AppDensity) => {
    setDensityState(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setMotion = useCallback((next: AppMotion) => {
    setMotionState(next);
    try {
      localStorage.setItem(MOTION_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = themeRef.current === "light" ? "dark" : "light";
    setTheme(next);
  }, [setTheme]);

  const value = useMemo(
    () => ({
      theme,
      density,
      motion,
      motionEffective,
      allowsAmbient: motionAllowsAmbient(motionEffective),
      allowsFeedback: motionAllowsFeedback(motionEffective),
      allowsNarrative: motionAllowsNarrative(motionEffective),
      setTheme,
      setDensity,
      setMotion,
      toggleTheme,
    }),
    [
      theme,
      density,
      motion,
      motionEffective,
      setTheme,
      setDensity,
      setMotion,
      toggleTheme,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

export function useOptionalTheme(): ThemeContextValue | null {
  return useContext(ThemeContext);
}
