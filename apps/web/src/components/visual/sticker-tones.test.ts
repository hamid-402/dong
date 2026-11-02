import { describe, expect, it } from "vitest";
import {
  SCENE_TONES,
  SPACE_KIND_TONES,
  STICKER_TONES,
  STICKER_TONES_BY_THEME,
  toneCssVars,
  type DangThemeId,
} from "./sticker-tones";

const THEMES: DangThemeId[] = ["white", "black", "paper", "midnight"];

describe("per-theme sticker scaffolding", () => {
  it("exposes white/black/paper/midnight maps with identical current values", () => {
    for (const theme of THEMES) {
      expect(STICKER_TONES_BY_THEME[theme]).toEqual(STICKER_TONES);
    }
  });

  it("keeps flat STICKER_TONES as the paper shim", () => {
    expect(STICKER_TONES).toBe(STICKER_TONES_BY_THEME.paper);
  });

  it("SPACE_KIND_TONES and SCENE_TONES still resolve from STICKER_TONES", () => {
    expect(SPACE_KIND_TONES.personal).toEqual(STICKER_TONES.wallet);
    expect(SPACE_KIND_TONES.group).toEqual(STICKER_TONES.ring);
    expect(SPACE_KIND_TONES.building).toEqual(STICKER_TONES.home);
    expect(SPACE_KIND_TONES.org).toEqual(STICKER_TONES.tower);
    expect(SCENE_TONES.home).toEqual(STICKER_TONES.mosaic);
    expect(SCENE_TONES.finance).toEqual(STICKER_TONES.coinTilt);
  });

  it("toneCssVars maps IconTone fields to CSS custom properties", () => {
    const tone = STICKER_TONES.wallet!;
    expect(toneCssVars(tone)).toEqual({
      "--icon-edge": tone.edge,
      "--icon-mid": tone.mid,
      "--icon-soft": tone.soft,
      "--icon-accent": tone.accent,
    });
  });
});
