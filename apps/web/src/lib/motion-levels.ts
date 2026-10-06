/**
 * Three conceptual motion levels for Dong chrome.
 * L1 ambient · L2 feedback · L3 narrative — never decorate money figures with emoji.
 */

export type AppMotion = "full" | "essential" | "off";

export const APP_MOTIONS: ReadonlyArray<{
  id: AppMotion;
  label: string;
  hint: string;
  levels: string;
}> = [
  {
    id: "full",
    label: "کامل (پیشنهادی)",
    hint: "بنر رنگی + شناوری قوی + جرقه + orb پس‌زمینه",
    levels: "آرام · پاسخ · روایت",
  },
  {
    id: "essential",
    label: "ثابت",
    hint: "بنر و استیکر می‌ماند؛ شناوری خاموش",
    levels: "پاسخ",
  },
  {
    id: "off",
    label: "حداقلی",
    hint: "کم‌حرکت‌ترین حالت",
    levels: "—",
  },
];

export function isAppMotion(value: string | null | undefined): value is AppMotion {
  return value === "full" || value === "essential" || value === "off";
}

/** Clamp stored preference when OS asks for reduced motion.
 * Never erase the visual layer — only drop to essential so stickers stay visible.
 */
export function effectiveMotion(
  preferred: AppMotion,
  osReducedMotion: boolean,
): AppMotion {
  if (!osReducedMotion) return preferred;
  if (preferred === "off") return "off";
  return "essential";
}

export function motionAllowsAmbient(level: AppMotion): boolean {
  return level === "full";
}

export function motionAllowsFeedback(level: AppMotion): boolean {
  return level === "full" || level === "essential";
}

export function motionAllowsNarrative(level: AppMotion): boolean {
  return level === "full";
}
