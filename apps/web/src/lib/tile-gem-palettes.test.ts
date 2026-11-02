import { describe, expect, it } from "vitest";
import {
  assignKindGems,
  gemCssVars,
  KIND_GEM_FAMILY,
  shellKindStyle,
  TILE_GEM_PALETTES,
  TILE_GEM_PALETTES_BY_THEME,
  type DangThemeId,
} from "./tile-gem-palettes";

const THEMES: DangThemeId[] = ["white", "black", "paper", "midnight"];

describe("assignKindGems", () => {
  it("keeps each space inside its kind family and distinct until the family is full", () => {
    const ids = ["a", "b", "c", "d"];
    const assigned = assignKindGems("group", ids);
    const family = new Set(KIND_GEM_FAMILY.group);
    const gems = ids.map((id) => assigned.get(id));
    expect(new Set(gems).size).toBe(ids.length);
    for (const gem of gems) expect(family.has(gem!)).toBe(true);
  });

  it("returns the same gem for the same id set", () => {
    const ids = ["org-2", "org-1"];
    const first = assignKindGems("org", ids);
    const second = assignKindGems("org", [...ids].reverse());
    expect(second.get("org-1")).toBe(first.get("org-1"));
    expect(second.get("org-2")).toBe(first.get("org-2"));
  });
});

describe("per-theme gem scaffolding", () => {
  it("exposes white/black/paper/midnight maps with identical current values", () => {
    for (const theme of THEMES) {
      expect(TILE_GEM_PALETTES_BY_THEME[theme]).toEqual(TILE_GEM_PALETTES);
    }
  });

  it("keeps flat TILE_GEM_PALETTES as the paper shim", () => {
    expect(TILE_GEM_PALETTES).toBe(TILE_GEM_PALETTES_BY_THEME.paper);
  });

  it("gemCssVars and shellKindStyle still emit edge/mid/center from the flat map", () => {
    const gem = TILE_GEM_PALETTES.teal!;
    expect(gemCssVars("teal")).toEqual({
      "--tile-gem-edge": gem.edge,
      "--tile-gem-mid": gem.mid,
      "--tile-gem-center": gem.center,
    });
    expect(shellKindStyle("teal")).toEqual({
      "--tile-gem-edge": gem.edge,
      "--tile-gem-mid": gem.mid,
      "--tile-gem-center": gem.center,
    });
  });
});
