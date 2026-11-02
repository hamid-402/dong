/** Design token maps — values alias live CSS `--dang-*` (single source in tokens.css). */

export const darkTokens = {
  bg: "var(--dang-bg)",
  surface: "var(--dang-surface)",
  surface2: "var(--dang-surface-2)",
  surface3: "var(--dang-surface-3)",
  text: "var(--dang-text)",
  muted: "var(--dang-muted)",
  primary: "var(--dang-primary)",
  primaryDeep: "var(--dang-primary-deep)",
  primaryInk: "var(--dang-primary-ink)",
  gold: "var(--dang-gold)",
  success: "var(--dang-success)",
  warning: "var(--dang-warning)",
  danger: "var(--dang-danger)",
} as const;

export const lightTokens = {
  bg: "var(--dang-bg)",
  surface: "var(--dang-surface)",
  surface2: "var(--dang-surface-2)",
  surface3: "var(--dang-surface-3)",
  text: "var(--dang-text)",
  muted: "var(--dang-muted)",
  primary: "var(--dang-primary)",
  primaryDeep: "var(--dang-primary-deep)",
  primaryInk: "var(--dang-primary-ink)",
  gold: "var(--dang-gold)",
  success: "var(--dang-success)",
  warning: "var(--dang-warning)",
  danger: "var(--dang-danger)",
} as const;

export type DesignTokens = typeof darkTokens;
