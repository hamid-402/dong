/** Cheerful dual-tone palettes — bright soft fills, clear mid edges (fintech-chic). */

export type IconTone = {
  edge: string;
  mid: string;
  soft: string;
  accent: string;
};

export const STICKER_TONES: Record<string, IconTone> = {
  wallet: { edge: "#0b6b5c", mid: "#2bb89a", soft: "#e4faf4", accent: "#7ee0c8" },
  ring: { edge: "#0c6e66", mid: "#2ecfc0", soft: "#e2fbf8", accent: "#a78bfa" },
  tower: { edge: "#5a3bb8", mid: "#8f78e6", soft: "#efeaff", accent: "#c9b8ff" },
  mosaic: { edge: "#0b6b5c", mid: "#2bb89a", soft: "#e4faf4", accent: "#f0c14d" },
  chartEmpty: { edge: "#1a4f9c", mid: "#4b8fe8", soft: "#e8f1ff", accent: "#93bfff" },
  coinTilt: { edge: "#9a6b12", mid: "#e0b84a", soft: "#fff6df", accent: "#f0c14d" },
  arrows: { edge: "#0b6b5c", mid: "#2bb89a", soft: "#e4faf4", accent: "#f0c14d" },
  sparkOk: { edge: "#157a45", mid: "#34c77a", soft: "#e6fbef", accent: "#ffd48a" },
  ledger: { edge: "#0b6b5c", mid: "#2bb89a", soft: "#e4faf4", accent: "#7ee0c8" },
  scale: { edge: "#1a4f9c", mid: "#4b8fe8", soft: "#e8f1ff", accent: "#93bfff" },
  lock: { edge: "#a33d66", mid: "#e07aa0", soft: "#ffeaf2", accent: "#f5b0c8" },
  invite: { edge: "#5a3bb8", mid: "#8f78e6", soft: "#efeaff", accent: "#c9b8ff" },
  check: { edge: "#157a45", mid: "#34c77a", soft: "#e6fbef", accent: "#7ae0a8" },
  bell: { edge: "#b06a10", mid: "#f0b040", soft: "#fff4de", accent: "#ffd48a" },
  calendar: { edge: "#1d55a8", mid: "#5596ef", soft: "#eaf2ff", accent: "#9dc2ff" },
  spark: { edge: "#9a6b12", mid: "#e0b84a", soft: "#fff6df", accent: "#ffe08a" },
  folder: { edge: "#0d6f86", mid: "#2db8d4", soft: "#e3f8fd", accent: "#7ee0f0" },
  handshake: { edge: "#0c6e66", mid: "#2ecfc0", soft: "#e2fbf8", accent: "#7aeadc" },
  shield: { edge: "#b83a32", mid: "#e56b60", soft: "#ffe9e6", accent: "#ffb0a6" },
  compass: { edge: "#3d4aaa", mid: "#7382e8", soft: "#eaecff", accent: "#b0b8ff" },
  home: { edge: "#1a4f9c", mid: "#4b8fe8", soft: "#e8f1ff", accent: "#93bfff" },
  coins: { edge: "#0b6b5c", mid: "#2bb89a", soft: "#e4faf4", accent: "#f0c14d" },
  team: { edge: "#0c6e66", mid: "#2ecfc0", soft: "#e2fbf8", accent: "#a78bfa" },
  grow: { edge: "#3f7a0c", mid: "#78c41a", soft: "#effcdc", accent: "#b8ef5c" },
  celebrate: { edge: "#157a45", mid: "#34c77a", soft: "#e6fbef", accent: "#ffd48a" },
  wave: { edge: "#0d6f86", mid: "#2db8d4", soft: "#e3f8fd", accent: "#7ee0f0" },
  cart: { edge: "#157a45", mid: "#34c77a", soft: "#e6fbef", accent: "#7ae0a8" },
  plant: { edge: "#4f6b18", mid: "#92b842", soft: "#f1f7dc", accent: "#c8e070" },
};

export const SPACE_KIND_TONES: Record<
  "personal" | "group" | "building" | "org",
  IconTone
> = {
  personal: STICKER_TONES.wallet!,
  group: STICKER_TONES.ring!,
  building: STICKER_TONES.home!,
  org: STICKER_TONES.tower!,
};

export const SCENE_TONES: Record<string, IconTone> = {
  home: STICKER_TONES.mosaic!,
  building: STICKER_TONES.home!,
  finance: STICKER_TONES.coinTilt!,
  partners: STICKER_TONES.ring!,
  procurement: STICKER_TONES.cart!,
  personal: STICKER_TONES.wallet!,
  success: STICKER_TONES.sparkOk!,
  invite: STICKER_TONES.invite!,
  security: STICKER_TONES.tower!,
};

export function toneCssVars(tone: IconTone): Record<string, string> {
  return {
    "--icon-edge": tone.edge,
    "--icon-mid": tone.mid,
    "--icon-soft": tone.soft,
    "--icon-accent": tone.accent,
  };
}
