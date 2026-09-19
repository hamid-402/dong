/**
 * Mosaic gem palettes — vivid mid/edge + richer pastel centers for light theme.
 * Dark themes use mid/edge as corner glow over charcoal (CSS).
 */
export const TILE_GEM_PALETTES: Record<
  string,
  { edge: string; mid: string; center: string; ink: string }
> = {
  teal: { edge: "#0f5c4d", mid: "#2f9f86", center: "#7ed4be", ink: "#062f2b" },
  emerald: { edge: "#0f5c3d", mid: "#28a875", center: "#6fd9a8", ink: "#062816" },
  cyan: { edge: "#0e6478", mid: "#2aadc4", center: "#6fd4e6", ink: "#04242e" },
  ocean: { edge: "#163f7a", mid: "#3b82c9", center: "#7eb3ef", ink: "#0b1f3a" },
  blue: { edge: "#1c4f9a", mid: "#4a8fe0", center: "#8ab8f5", ink: "#0b1f3a" },
  indigo: { edge: "#3a4494", mid: "#6b78d4", center: "#a4aef0", ink: "#16183a" },
  violet: { edge: "#553894", mid: "#8b6fd0", center: "#b9a3eb", ink: "#1e1230" },
  plum: { edge: "#6a3478", mid: "#a86cbc", center: "#d0a0dc", ink: "#241028" },
  rose: { edge: "#943a5c", mid: "#d46a90", center: "#ef9db8", ink: "#2a0a1a" },
  coral: { edge: "#943832", mid: "#d46f64", center: "#efa89f", ink: "#2a0f0e" },
  amber: { edge: "#94560a", mid: "#d99a2e", center: "#f0c66a", ink: "#241a08" },
  gold: { edge: "#7a5a14", mid: "#c9a43a", center: "#e8c96e", ink: "#1b160c" },
  olive: { edge: "#4f5c1c", mid: "#8fa63e", center: "#c0d474", ink: "#1a2e05" },
  lime: { edge: "#3f6b0a", mid: "#74b812", center: "#b0e04a", ink: "#1a2e05" },
  mint: { edge: "#0c635c", mid: "#2fbfb0", center: "#6ee0d2", ink: "#042f2e" },
  slate: { edge: "#3f4c5a", mid: "#718392", center: "#a8b6c2", ink: "#101816" },
  graphite: { edge: "#334155", mid: "#64748b", center: "#94a3b8", ink: "#0f172a" },
  copper: { edge: "#85300e", mid: "#d9773a", center: "#f0a86a", ink: "#2a1405" },
  // legacy aliases
  deep: { edge: "#0f5c4d", mid: "#24806f", center: "#6bc4b0", ink: "#041614" },
  ivory: { edge: "#6e695c", mid: "#b0a890", center: "#ddd6c4", ink: "#1a1812" },
  sky: { edge: "#1d4ed8", mid: "#3b82f6", center: "#7eb6ff", ink: "#0b1f3a" },
  "coral-deep": { edge: "#8a241c", mid: "#c24a3c", center: "#e8887c", ink: "#2a0c0a" },
};

/** Semantic roles (folders / intents) — happier spread like دانش‌بان */
export const GEM_ROLE = {
  finance: "teal",
  decide: "amber",
  monitor: "blue",
  manage: "violet",
  social: "mint",
  security: "coral",
  personal: "indigo",
  catalog: "olive",
} as const;

/**
 * Per-route gem — each hub tile gets its own color personality
 * (دانش‌بان mosaic variety), not only the 4 intents.
 */
export const ROUTE_GEM: Readonly<Record<string, string>> = {
  expenses: "teal",
  ledger: "cyan",
  procurement: "emerald",
  settlements: "amber",
  approvals: "coral",
  addons: "rose",
  proposals: "violet",
  invoices: "blue",
  statements: "ocean",
  "org-finance": "indigo",
  partners: "gold",
  charts: "sky",
  metrics: "lime",
  audit: "slate",
  jobs: "graphite",
  admin: "copper",
  security: "coral-deep",
  "whats-new": "mint",
  recurring: "olive",
  assets: "copper",
  catalog: "lime",
  invite: "plum",
  settings: "slate",
  profile: "indigo",
  friends: "mint",
  privacy: "ocean",
  finance: "teal",
};
