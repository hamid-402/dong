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

/** Product surface themes — dark/light/dusk/mist + linear (دانش‌بان Linear/Vercel). */
export type AppTheme = "dark" | "light" | "dusk" | "mist" | "linear";

/** Selectable ambient backgrounds (orbs / wash) — independent of theme. */
export type AppAtmosphere = "deep" | "forest" | "sand" | "ember";

/** UI density — dabir-style, independent of theme/atmosphere. */
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
  { id: "linear", label: "Linear", caption: "پرکنتراست و دقیق", swatch: "#050506" },
  { id: "dark", label: "شب نیمه‌شب", caption: "OLED و فیروزه‌ای", swatch: "#070a0c" },
  { id: "dusk", label: "غروب گرم", caption: "آلبالویی و کهربایی", swatch: "#171217" },
  { id: "mist", label: "مه خنک", caption: "آبی‌خاکستری", swatch: "#e6edf4" },
  { id: "light", label: "روز روشن", caption: "کاغذ ملایم", swatch: "#f4f7f9" },
];

export const APP_ATMOSPHERES: ReadonlyArray<{
  id: AppAtmosphere;
  label: string;
  hint: string;
}> = [
  { id: "deep", label: "آرام", hint: "گرادیان ملایم روی بوم" },
  { id: "forest", label: "مش", hint: "لکه‌های رنگی روی بوم" },
  { id: "sand", label: "کاغذ", hint: "بافت نویز و خطوط ریز" },
  { id: "ember", label: "اورورا", hint: "آبی، فیروزه و بنفش مثل دانش‌بان" },
];

export const APP_DENSITIES: ReadonlyArray<{
  id: AppDensity;
  label: string;
  hint: string;
}> = [
  { id: "comfortable", label: "راحت", hint: "فاصلهٔ استاندارد لمسی" },
  { id: "compact", label: "فشرده", hint: "فهرست‌های حرفه‌ای‌تر" },
];

const THEME_COLORS: Record<AppTheme, string> = {
  dark: "#070a0c",
  light: "#f4f7f9",
  dusk: "#171217",
  mist: "#e6edf4",
  linear: "#050506",
};

type ThemeContextValue = {
  theme: AppTheme;
  atmosphere: AppAtmosphere;
  density: AppDensity;
  /** User preference (may be overridden by OS reduced-motion). */
  motion: AppMotion;
  /** Effective level after OS clamp — drive UI from this. */
  motionEffective: AppMotion;
  allowsAmbient: boolean;
  allowsFeedback: boolean;
  allowsNarrative: boolean;
  setTheme: (theme: AppTheme) => void;
  setAtmosphere: (atmosphere: AppAtmosphere) => void;
  setDensity: (density: AppDensity) => void;
  setMotion: (motion: AppMotion) => void;
  /** Cycles dark ↔ light for one-tap compatibility. */
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function isAppTheme(value: string | null | undefined): value is AppTheme {
  return (
    value === "dark" ||
    value === "light" ||
    value === "dusk" ||
    value === "mist" ||
    value === "linear"
  );
}

export function isAppAtmosphere(
  value: string | null | undefined,
): value is AppAtmosphere {
  return (
    value === "deep" ||
    value === "forest" ||
    value === "sand" ||
    value === "ember"
  );
}

export function isAppDensity(
  value: string | null | undefined,
): value is AppDensity {
  return value === "comfortable" || value === "compact";
}

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (isAppTheme(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "dark";
}

function readStoredAtmosphere(): AppAtmosphere {
  if (typeof window === "undefined") return "deep";
  try {
    const raw = localStorage.getItem(ATMOSPHERE_KEY);
    if (isAppAtmosphere(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "deep";
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
  atmosphere: AppAtmosphere,
  density: AppDensity,
  motion: AppMotion,
) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-atmosphere", atmosphere);
  document.documentElement.setAttribute("data-density", density);
  document.documentElement.setAttribute("data-motion", motion);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

/** Persists theme + atmosphere + density + motion on <html>. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("dark");
  const [atmosphere, setAtmosphereState] = useState<AppAtmosphere>("deep");
  const [density, setDensityState] = useState<AppDensity>("comfortable");
  const [motion, setMotionState] = useState<AppMotion>("full");
  const [osReduced, setOsReduced] = useState(false);
  const themeRef = useRef(theme);
  const atmosphereRef = useRef(atmosphere);
  const densityRef = useRef(density);
  const motionRef = useRef(motion);
  useEffect(() => {
    themeRef.current = theme;
    atmosphereRef.current = atmosphere;
    densityRef.current = density;
    motionRef.current = motion;
  }, [theme, atmosphere, density, motion]);

  const motionEffective = effectiveMotion(motion, osReduced);

  useEffect(() => {
    const nextTheme = readStoredTheme();
    const nextAtmosphere = readStoredAtmosphere();
    const nextDensity = readStoredDensity();
    const nextMotion = readStoredMotion();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setOsReduced(mq.matches);
    setThemeState(nextTheme);
    setAtmosphereState(nextAtmosphere);
    setDensityState(nextDensity);
    setMotionState(nextMotion);
    applyAppearance(
      nextTheme,
      nextAtmosphere,
      nextDensity,
      effectiveMotion(nextMotion, mq.matches),
    );
    const onChange = () => {
      setOsReduced(mq.matches);
      applyAppearance(
        themeRef.current,
        atmosphereRef.current,
        densityRef.current,
        effectiveMotion(motionRef.current, mq.matches),
      );
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyAppearance(theme, atmosphere, density, motionEffective);
  }, [theme, atmosphere, density, motionEffective]);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setAtmosphere = useCallback((next: AppAtmosphere) => {
    setAtmosphereState(next);
    try {
      localStorage.setItem(ATMOSPHERE_KEY, next);
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
    const next =
      themeRef.current === "light" || themeRef.current === "mist" ? "dark" : "light";
    setTheme(next);
  }, [setTheme]);

  const value = useMemo(
    () => ({
      theme,
      atmosphere,
      density,
      motion,
      motionEffective,
      allowsAmbient: motionAllowsAmbient(motionEffective),
      allowsFeedback: motionAllowsFeedback(motionEffective),
      allowsNarrative: motionAllowsNarrative(motionEffective),
      setTheme,
      setAtmosphere,
      setDensity,
      setMotion,
      toggleTheme,
    }),
    [
      theme,
      atmosphere,
      density,
      motion,
      motionEffective,
      setTheme,
      setAtmosphere,
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
