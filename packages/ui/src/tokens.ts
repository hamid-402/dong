export const darkTokens = {
  bg: "#090E0D",
  surface: "#101816",
  surface2: "#16211E",
  surface3: "#1B2925",
  text: "#F3F1E9",
  muted: "#9EAAA6",
  primary: "#57D7C5",
  primaryDeep: "#0F766E",
  primaryInk: "#062F2B",
  gold: "#C9AA70",
  success: "#55D68B",
  warning: "#E7B85D",
  danger: "#ED7C78",
} as const;

export const lightTokens = {
  bg: "#F7F9F8",
  surface: "#FFFFFF",
  surface2: "#F0F4F2",
  surface3: "#E7EEEB",
  text: "#14201D",
  muted: "#53615D",
  primary: "#0F766E",
  primaryDeep: "#115E59",
  primaryInk: "#FFFFFF",
  gold: "#B45309",
  success: "#15803D",
  warning: "#A16207",
  danger: "#B91C1C",
} as const;

export type DesignTokens = typeof darkTokens;
