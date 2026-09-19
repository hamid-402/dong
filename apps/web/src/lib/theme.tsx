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

/** Product surface themes — dark/light/dusk/mist + linear (دانش‌بان Linear/Vercel). */
export type AppTheme = "dark" | "light" | "dusk" | "mist" | "linear";

/** Selectable ambient backgrounds (orbs / wash) — independent of theme. */
export type AppAtmosphere = "deep" | "forest" | "sand" | "ember";

/** UI density — dabir-style, independent of theme/atmosphere. */
export type AppDensity = "comfortable" | "compact";

const THEME_KEY = "dang-theme";
const ATMOSPHERE_KEY = "dang-atmosphere";
const DENSITY_KEY = "dang-density";

export const APP_THEMES: ReadonlyArray<{
  id: AppTheme;
  label: string;
  caption: string;
  swatch: string;
}> = [
  { id: "linear", label: "Linear", caption: "پرکنتراست و دقیق", swatch: "#09090b" },
  { id: "dark", label: "شب نیمه‌شب", caption: "OLED و فیروزه‌ای", swatch: "#070a0c" },
  { id: "dusk", label: "غروب گرم", caption: "آلبالویی و کهربایی", swatch: "#1a1418" },
  { id: "mist", label: "مه خنک", caption: "آبی‌خاکستری", swatch: "#e8eef4" },
  { id: "light", label: "روز روشن", caption: "کاغذ خنک", swatch: "#f5f7fa" },
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
  light: "#f5f7fa",
  dusk: "#1a1418",
  mist: "#e8eef4",
  linear: "#09090b",
};

type ThemeContextValue = {
  theme: AppTheme;
  atmosphere: AppAtmosphere;
  density: AppDensity;
  setTheme: (theme: AppTheme) => void;
  setAtmosphere: (atmosphere: AppAtmosphere) => void;
  setDensity: (density: AppDensity) => void;
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

function applyAppearance(
  theme: AppTheme,
  atmosphere: AppAtmosphere,
  density: AppDensity,
) {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-atmosphere", atmosphere);
  document.documentElement.setAttribute("data-density", density);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

/** Persists theme + atmosphere + density on <html>. Default theme is dark. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>("dark");
  const [atmosphere, setAtmosphereState] = useState<AppAtmosphere>("deep");
  const [density, setDensityState] = useState<AppDensity>("comfortable");
  const themeRef = useRef(theme);
  const atmosphereRef = useRef(atmosphere);
  const densityRef = useRef(density);
  themeRef.current = theme;
  atmosphereRef.current = atmosphere;
  densityRef.current = density;

  useEffect(() => {
    const nextTheme = readStoredTheme();
    const nextAtmosphere = readStoredAtmosphere();
    const nextDensity = readStoredDensity();
    setThemeState(nextTheme);
    setAtmosphereState(nextAtmosphere);
    setDensityState(nextDensity);
    applyAppearance(nextTheme, nextAtmosphere, nextDensity);
  }, []);

  const setTheme = useCallback((next: AppTheme) => {
    setThemeState(next);
    applyAppearance(next, atmosphereRef.current, densityRef.current);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setAtmosphere = useCallback((next: AppAtmosphere) => {
    setAtmosphereState(next);
    applyAppearance(themeRef.current, next, densityRef.current);
    try {
      localStorage.setItem(ATMOSPHERE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const setDensity = useCallback((next: AppDensity) => {
    setDensityState(next);
    applyAppearance(themeRef.current, atmosphereRef.current, next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
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
      setTheme,
      setAtmosphere,
      setDensity,
      toggleTheme,
    }),
    [theme, atmosphere, density, setTheme, setAtmosphere, setDensity, toggleTheme],
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
