/**
 * Mosaic gem palettes — solid rim + pastel wash (فضای کار موزاییکی).
 * Used by `.dang-gem` as --tile-gem-edge / mid / center.
 */
import type { CSSProperties } from "react";
import type { SpaceKind } from "@dang/contracts";

export const TILE_GEM_PALETTES: Record<
  string,
  { edge: string; mid: string; center: string; ink: string }
> = {
  teal: { edge: "#0f766e", mid: "#2dd4bf", center: "#ccfbf1", ink: "#134e4a" },
  emerald: { edge: "#15803d", mid: "#4ade80", center: "#dcfce7", ink: "#14532d" },
  cyan: { edge: "#0e7490", mid: "#22d3ee", center: "#cffafe", ink: "#164e63" },
  ocean: { edge: "#1d4ed8", mid: "#60a5fa", center: "#dbeafe", ink: "#1e3a8a" },
  blue: { edge: "#1d4ed8", mid: "#60a5fa", center: "#dbeafe", ink: "#1e3a8a" },
  indigo: { edge: "#4338ca", mid: "#818cf8", center: "#e0e7ff", ink: "#312e81" },
  violet: { edge: "#7e22ce", mid: "#c084fc", center: "#f3e8ff", ink: "#581c87" },
  plum: { edge: "#a21caf", mid: "#e879f9", center: "#fae8ff", ink: "#701a75" },
  rose: { edge: "#be123c", mid: "#fb7185", center: "#ffe4e6", ink: "#9f1239" },
  coral: { edge: "#c2410c", mid: "#fb923c", center: "#ffedd5", ink: "#9a3412" },
  amber: { edge: "#b45309", mid: "#fbbf24", center: "#fef3c7", ink: "#92400e" },
  gold: { edge: "#a16207", mid: "#facc15", center: "#fef9c3", ink: "#854d0e" },
  olive: { edge: "#4d7c0f", mid: "#a3e635", center: "#ecfccb", ink: "#365314" },
  lime: { edge: "#4d7c0f", mid: "#a3e635", center: "#ecfccb", ink: "#3f6212" },
  mint: { edge: "#0f766e", mid: "#2dd4bf", center: "#ccfbf1", ink: "#115e59" },
  slate: { edge: "#475569", mid: "#94a3b8", center: "#f1f5f9", ink: "#1e293b" },
  graphite: { edge: "#334155", mid: "#64748b", center: "#e2e8f0", ink: "#0f172a" },
  jade: { edge: "#047857", mid: "#34d399", center: "#d1fae5", ink: "#064e3b" },
  pine: { edge: "#14532d", mid: "#22c55e", center: "#dcfce7", ink: "#052e16" },
  spring: { edge: "#65a30d", mid: "#bef264", center: "#f7fee7", ink: "#3f6212" },
  viridian: { edge: "#115e59", mid: "#5eead4", center: "#ccfbf1", ink: "#134e4a" },
  moss: { edge: "#3f6212", mid: "#84cc16", center: "#ecfccb", ink: "#365314" },
  meadow: { edge: "#166534", mid: "#86efac", center: "#dcfce7", ink: "#14532d" },
  rust: { edge: "#9a3412", mid: "#fdba74", center: "#ffedd5", ink: "#7c2d12" },
  bronze: { edge: "#92400e", mid: "#f59e0b", center: "#fef3c7", ink: "#78350f" },
  apricot: { edge: "#ea580c", mid: "#fdba74", center: "#ffedd5", ink: "#9a3412" },
  honey: { edge: "#d97706", mid: "#fcd34d", center: "#fef3c7", ink: "#92400e" },
  wheat: { edge: "#ca8a04", mid: "#fde047", center: "#fef9c3", ink: "#854d0e" },
  saffron: { edge: "#a16207", mid: "#fbbf24", center: "#fef3c7", ink: "#713f12" },
  iris: { edge: "#6d28d9", mid: "#a78bfa", center: "#ede9fe", ink: "#4c1d95" },
  grape: { edge: "#581c87", mid: "#d8b4fe", center: "#f3e8ff", ink: "#3b0764" },
  lilac: { edge: "#7c3aed", mid: "#c4b5fd", center: "#ede9fe", ink: "#5b21b6" },
  royal: { edge: "#4c1d95", mid: "#8b5cf6", center: "#ede9fe", ink: "#2e1065" },
  fuchsia: { edge: "#86198f", mid: "#f0abfc", center: "#fae8ff", ink: "#701a75" },
  orchid: { edge: "#c026d3", mid: "#e879f9", center: "#fae8ff", ink: "#86198f" },
  mulberry: { edge: "#9d174d", mid: "#f472b6", center: "#fce7f3", ink: "#831843" },
  amethyst: { edge: "#5b21b6", mid: "#c084fc", center: "#f3e8ff", ink: "#4c1d95" },
  cobalt: { edge: "#1e40af", mid: "#93c5fd", center: "#dbeafe", ink: "#1e3a8a" },
  arctic: { edge: "#0369a1", mid: "#38bdf8", center: "#e0f2fe", ink: "#0c4a6e" },
  periwinkle: { edge: "#4f46e5", mid: "#a5b4fc", center: "#e0e7ff", ink: "#312e81" },
  dusk: { edge: "#312e81", mid: "#818cf8", center: "#e0e7ff", ink: "#1e1b4b" },
  navy: { edge: "#1e3a8a", mid: "#60a5fa", center: "#dbeafe", ink: "#172554" },
  ice: { edge: "#0284c7", mid: "#7dd3fc", center: "#e0f2fe", ink: "#0c4a6e" },
  denim: { edge: "#1d4ed8", mid: "#93c5fd", center: "#dbeafe", ink: "#1e3a8a" },
  sapphire: { edge: "#1e40af", mid: "#60a5fa", center: "#dbeafe", ink: "#172554" },
  copper: { edge: "#c2410c", mid: "#fb923c", center: "#ffedd5", ink: "#9a3412" },
  // legacy aliases
  deep: { edge: "#0f766e", mid: "#2dd4bf", center: "#ccfbf1", ink: "#134e4a" },
  ivory: { edge: "#78716c", mid: "#d6d3d1", center: "#fafaf9", ink: "#44403c" },
  sky: { edge: "#1d4ed8", mid: "#3b82f6", center: "#dbeafe", ink: "#1e3a8a" },
  "coral-deep": { edge: "#b91c1c", mid: "#f87171", center: "#fee2e2", ink: "#7f1d1d" },
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
  members: "mint",
  subunits: "olive",
  space: "teal",
  home: "blue",
};

/** CSS custom properties for `.dang-gem` / mosaic tiles.
 * Ink is theme-owned (light surface → dark type; dark surface → light type).
 * Only hue stops are set here so dark themes never inherit dark palette ink.
 */
/** Shell accent for the open space — same gem the directory tile uses. */
export function shellKindStyle(gemKey: string | undefined): CSSProperties {
  const gem = TILE_GEM_PALETTES[gemKey ?? ""] ?? TILE_GEM_PALETTES.teal;
  if (!gem) return {};
  return {
    "--tile-gem-edge": gem.edge,
    "--tile-gem-mid": gem.mid,
    "--tile-gem-center": gem.center,
    "--kind-mid": gem.mid,
    "--kind-edge": gem.edge,
  } as CSSProperties;
}

export function gemCssVars(gemKey?: string): CSSProperties {
  const gem = TILE_GEM_PALETTES[gemKey ?? ""] ?? TILE_GEM_PALETTES.teal;
  if (!gem) return {};
  return {
    "--tile-gem-edge": gem.edge,
    "--tile-gem-mid": gem.mid,
    "--tile-gem-center": gem.center,
  } as CSSProperties;
}

/** Sibling hues inside one kind. Menus stay on the lead color; each space picks one. */
export const KIND_GEM_FAMILY: Record<SpaceKind, readonly string[]> = {
  personal: ["indigo", "ocean", "cobalt", "arctic", "periwinkle", "dusk", "navy", "ice", "denim", "sapphire"],
  group: ["teal", "emerald", "olive", "cyan", "jade", "pine", "spring", "viridian", "moss", "meadow"],
  building: ["amber", "gold", "copper", "rust", "bronze", "apricot", "honey", "wheat", "saffron", "coral"],
  org: ["violet", "plum", "iris", "grape", "lilac", "royal", "fuchsia", "orchid", "mulberry", "amethyst"],
};

function hashSpaceId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (Math.imul(hash, 31) + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Distinct family colors for a set of spaces. The same id set always yields
 * the same gem; a new id only shifts a color when the family is already full.
 */
export function assignKindGems(
  kind: SpaceKind,
  ids: readonly string[],
): Map<string, string> {
  const family = KIND_GEM_FAMILY[kind];
  const used = new Set<number>();
  const out = new Map<string, string>();
  const ordered = [...ids].sort((a, b) => a.localeCompare(b));
  for (const id of ordered) {
    let index = family.length === 0 ? 0 : hashSpaceId(id) % family.length;
    for (let step = 0; step < family.length && used.has(index); step += 1) {
      index = (index + 1) % family.length;
    }
    used.add(index);
    const key = family[index] ?? family[0];
    if (key) out.set(id, key);
  }
  return out;
}
