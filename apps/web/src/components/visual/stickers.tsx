/** Chosen sticker pack (P1 G4 B1 O2 H2 E4 X4 S2 OK2) + legacy aliases. */

"use client";

import { useId } from "react";
import { STICKER_TONES, type IconTone } from "@/components/visual/sticker-tones";

export type StickerName =
  | "wallet"
  | "ring"
  | "tower"
  | "mosaic"
  | "chartEmpty"
  | "coinTilt"
  | "arrows"
  | "sparkOk"
  | "ledger"
  | "scale"
  | "lock"
  | "invite"
  | "check"
  | "bell"
  | "calendar"
  | "spark"
  | "folder"
  | "handshake"
  | "shield"
  | "compass"
  | "home"
  | "coins"
  | "team"
  | "grow"
  | "celebrate"
  | "wave"
  | "cart"
  | "plant";

const SIZE = 56;

function toneFor(name: StickerName): IconTone {
  return STICKER_TONES[name] ?? STICKER_TONES.spark!;
}

/** Preferred micro-motion — calm defaults; lively only for hero/empty accents. */
export function stickerDefaultMotion(name: StickerName): string {
  switch (name) {
    case "sparkOk":
    case "celebrate":
      return "dang-sticker--pulse";
    case "coinTilt":
      return "dang-sticker--float";
    case "mosaic":
    case "ring":
    case "wallet":
    case "home":
    case "tower":
    case "chartEmpty":
    case "arrows":
      return "dang-sticker--bob";
    default:
      return "dang-sticker--float";
  }
}

export function StickerSvg({
  name,
  className,
  animated = false,
  size = SIZE,
  motionClass,
}: {
  name: StickerName;
  className?: string;
  animated?: boolean;
  size?: number;
  motionClass?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const motion = animated
    ? (motionClass ?? stickerDefaultMotion(name))
    : motionClass;
  const cls = ["dang-sticker", motion, className].filter(Boolean).join(" ");
  const tone = toneFor(name);
  const gid = `sg-${name}-${uid}`;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 64 64",
    className: cls,
    "aria-hidden": true as const,
  };

  const defs = (
    <defs>
      <linearGradient id={`${gid}-fill`} x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
        <stop stopColor={tone.soft} />
        <stop offset="0.55" stopColor={tone.accent} stopOpacity="0.72" />
        <stop offset="1" stopColor={tone.mid} stopOpacity="0.35" />
      </linearGradient>
      <linearGradient id={`${gid}-rim`} x1="14" y1="10" x2="50" y2="54" gradientUnits="userSpaceOnUse">
        <stop stopColor={tone.mid} />
        <stop offset="1" stopColor={tone.edge} />
      </linearGradient>
      <linearGradient id={`${gid}-shine`} x1="18" y1="12" x2="40" y2="36" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`${gid}-glow`} cx="32" cy="28" r="26" gradientUnits="userSpaceOnUse">
        <stop stopColor={tone.accent} stopOpacity="0.35" />
        <stop offset="1" stopColor={tone.accent} stopOpacity="0" />
      </radialGradient>
    </defs>
  );

  const fill = `url(#${gid}-fill)`;
  const rim = `url(#${gid}-rim)`;
  const shine = `url(#${gid}-shine)`;
  const glow = `url(#${gid}-glow)`;

  switch (name) {
    /* —— User picks —— */
    case "wallet": /* P1 */
      return (
        <svg {...common}>
          {defs}
          <ellipse cx="32" cy="54" rx="18" ry="4" fill={glow} />
          <path
            d="M11 21h37a7 7 0 0 1 7 7v19a7 7 0 0 1-7 7H15a7 7 0 0 1-7-7V28a7 7 0 0 1 7-7z"
            fill={fill}
            stroke={rim}
            strokeWidth="2"
          />
          <path d="M8 29h48" stroke={tone.mid} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M14 24h28" stroke={shine} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
          <rect
            x="38"
            y="35"
            width="14"
            height="10"
            rx="3"
            fill={tone.soft}
            stroke={tone.edge}
            strokeWidth="1.4"
          />
          <circle cx="45" cy="40" r="2.4" fill={tone.accent} stroke={tone.edge} strokeWidth="1" />
        </svg>
      );
    case "ring": /* G4 */
      return (
        <svg {...common}>
          {defs}
          <circle cx="32" cy="32" r="22" fill={glow} />
          <circle
            cx="32"
            cy="32"
            r="20"
            fill="none"
            stroke={rim}
            strokeWidth="2.4"
            strokeDasharray="5 4.5"
            strokeLinecap="round"
          />
          <circle cx="32" cy="32" r="8.5" fill={fill} stroke={tone.edge} strokeWidth="1.7" />
          <circle cx="32" cy="32" r="3.2" fill={tone.accent} />
          <circle cx="17" cy="18" r="4.6" fill={tone.soft} stroke={tone.edge} strokeWidth="1.4" />
          <circle cx="47" cy="18" r="4.6" fill={tone.soft} stroke={tone.edge} strokeWidth="1.4" />
          <circle cx="17" cy="46" r="4.6" fill={tone.soft} stroke={tone.edge} strokeWidth="1.4" />
          <circle cx="47" cy="46" r="4.6" fill={tone.soft} stroke={tone.edge} strokeWidth="1.4" />
          <circle cx="17" cy="18" r="1.6" fill={tone.mid} />
          <circle cx="47" cy="18" r="1.6" fill={tone.mid} />
          <circle cx="17" cy="46" r="1.6" fill={tone.mid} />
          <circle cx="47" cy="46" r="1.6" fill={tone.mid} />
        </svg>
      );
    case "tower": /* O2 */
      return (
        <svg {...common}>
          {defs}
          <ellipse cx="32" cy="56" rx="14" ry="3.5" fill={glow} />
          <path
            d="M21 54V17.5L32 8l11 9.5V54z"
            fill={fill}
            stroke={rim}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M24 16h16" stroke={shine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" />
          <path
            d="M25 26h14M25 36h14M25 46h14"
            stroke={tone.mid}
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <rect x="29" y="48" width="6" height="6" rx="1.2" fill={tone.accent} stroke={tone.edge} strokeWidth="1.2" />
        </svg>
      );
    case "mosaic": /* H2 */
      return (
        <svg {...common}>
          {defs}
          <rect x="9" y="9" width="20" height="20" rx="5" fill="#7ee0c8" stroke={tone.edge} strokeWidth="1.5" />
          <rect x="35" y="9" width="20" height="20" rx="5" fill="#f0c14d" stroke={tone.edge} strokeWidth="1.5" />
          <rect x="9" y="35" width="20" height="20" rx="5" fill="#93bfff" stroke={tone.edge} strokeWidth="1.5" />
          <rect x="35" y="35" width="20" height="20" rx="5" fill="#c9b8ff" stroke={tone.edge} strokeWidth="1.5" />
          <path d="M13 14h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
          <path d="M39 14h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.4" />
          <path d="M13 40h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.4" />
          <path d="M39 40h10" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" />
          <circle cx="32" cy="32" r="3.4" fill="#fff" stroke={tone.edge} strokeWidth="1.2" />
        </svg>
      );
    case "chartEmpty": /* E4 */
      return (
        <svg {...common}>
          {defs}
          <circle cx="34" cy="30" r="20" fill={glow} />
          <path
            d="M13 50h38M13 12v38"
            stroke={rim}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="24" cy="38" r="3.6" fill={tone.soft} stroke={tone.mid} strokeWidth="1.4" />
          <circle cx="35" cy="28" r="3.6" fill={tone.soft} stroke={tone.mid} strokeWidth="1.4" />
          <circle cx="46" cy="18" r="3.6" fill={tone.accent} stroke={tone.edge} strokeWidth="1.4" />
          <path
            d="M24 38 35 28 46 18"
            fill="none"
            stroke={tone.mid}
            strokeWidth="1.8"
            strokeDasharray="3.5 3"
            strokeLinecap="round"
          />
        </svg>
      );
    case "coinTilt": /* X4 */
      return (
        <svg {...common}>
          {defs}
          <ellipse cx="34" cy="52" rx="16" ry="4" fill={glow} />
          <ellipse
            cx="32"
            cy="34"
            rx="17"
            ry="14.5"
            transform="rotate(-18 32 34)"
            fill={fill}
            stroke={rim}
            strokeWidth="2.1"
          />
          <ellipse
            cx="32"
            cy="34"
            rx="11"
            ry="9"
            transform="rotate(-18 32 34)"
            fill="none"
            stroke={tone.mid}
            strokeWidth="1.5"
            opacity="0.7"
          />
          <path
            d="M32 23.5v21M23.5 34h17"
            stroke={tone.edge}
            strokeWidth="2.1"
            strokeLinecap="round"
            transform="rotate(-18 32 34)"
          />
          <path
            d="M22 26c4-5 10-6 14-3"
            stroke={shine}
            strokeWidth="2.4"
            strokeLinecap="round"
            transform="rotate(-18 32 34)"
            opacity="0.75"
          />
        </svg>
      );
    case "arrows": /* S2 */
      return (
        <svg {...common}>
          {defs}
          <circle cx="32" cy="32" r="22" fill={glow} />
          <path
            d="M11 23h30l-7-7"
            fill="none"
            stroke={rim}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M53 41H23l7 7"
            fill="none"
            stroke={rim}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18 23h12M34 41h12"
            stroke={tone.accent}
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case "sparkOk": /* OK2 */
      return (
        <svg {...common}>
          {defs}
          <circle cx="32" cy="36" r="22" fill={glow} />
          <circle cx="32" cy="36" r="16.5" fill={fill} stroke={rim} strokeWidth="2.1" />
          <path
            d="m22.5 36 6.2 6.2 13.2-15"
            fill="none"
            stroke={tone.edge}
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13 12l3.2 8.2 8.2 3.2-8.2 3.2L13 35l-3.2-8.2L1.6 23.6l8.2-3.2z"
            fill={tone.accent}
            stroke={tone.edge}
            strokeWidth="1"
          />
          <circle cx="44" cy="14" r="2.2" fill={tone.mid} />
          <circle cx="50" cy="22" r="1.5" fill={tone.accent} />
        </svg>
      );

    /* —— Legacy / shared —— */
    case "home": /* B1 */
      return (
        <svg {...common}>
          {defs}
          <ellipse cx="32" cy="56" rx="16" ry="3.5" fill={glow} />
          <path
            d="M9 31 32 11l23 20v25H9z"
            fill={fill}
            stroke={rim}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M18 28h28" stroke={shine} strokeWidth="2.6" strokeLinecap="round" opacity="0.5" />
          <rect
            x="26"
            y="36"
            width="12"
            height="20"
            rx="2.2"
            fill={tone.accent}
            stroke={tone.edge}
            strokeWidth="1.5"
          />
          <circle cx="35.5" cy="46" r="1.3" fill={tone.edge} />
          <path d="M20 22h8v-5.5z" fill={tone.mid} stroke={tone.edge} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "ledger":
      return (
        <svg {...common}>
          {defs}
          <rect x="12" y="10" width="40" height="44" rx="8" fill={fill} stroke={rim} strokeWidth="1.8" />
          <path d="M20 22h24M20 32h24M20 42h14" stroke={tone.edge} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "scale":
      return (
        <svg {...common}>
          {defs}
          <path d="M32 12v36M18 24h28" stroke={rim} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M18 24c0 8 6 14 14 14s14-6 14-14" fill="none" stroke={tone.mid} strokeWidth="2" />
          <circle cx="18" cy="24" r="4" fill={tone.accent} />
          <circle cx="46" cy="24" r="4" fill={tone.mid} stroke={tone.edge} strokeWidth="1.3" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          {defs}
          <rect x="16" y="28" width="32" height="24" rx="7" fill={fill} stroke={rim} strokeWidth="1.8" />
          <path d="M24 28v-6a8 8 0 0 1 16 0v6" fill="none" stroke={tone.mid} strokeWidth="2.2" />
          <circle cx="32" cy="40" r="3.2" fill={tone.edge} />
        </svg>
      );
    case "invite":
      return (
        <svg {...common}>
          {defs}
          <rect x="9" y="17" width="46" height="32" rx="8" fill={fill} stroke={rim} strokeWidth="1.8" />
          <path d="m9 22 23 15 23-15" fill="none" stroke={tone.mid} strokeWidth="2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          {defs}
          <circle cx="32" cy="32" r="18" fill={fill} stroke={rim} strokeWidth="2" />
          <path
            d="m22 33 7 7 14-16"
            fill="none"
            stroke={tone.edge}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          {defs}
          <path
            d="M40 26a8 8 0 1 0-16 0c0 10-4 10-4 13h24c0-3-4-3-4-13"
            fill={fill}
            stroke={rim}
            strokeWidth="1.8"
          />
          <path d="M28 44h8" stroke={tone.edge} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          {defs}
          <rect x="13" y="15" width="38" height="36" rx="8" fill={fill} stroke={rim} strokeWidth="1.8" />
          <path d="M13 26h38M24 11v10M40 11v10" stroke={tone.mid} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          {defs}
          <path
            d="M32 12l3.2 14 14 3.2-14 3.2L32 52l-3.2-14-14-3.2 14-3.2z"
            fill={tone.accent}
            stroke={tone.edge}
            strokeWidth="1.4"
          />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          {defs}
          <path
            d="M11 22h17l5 5h20v23H11z"
            fill={fill}
            stroke={rim}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "handshake":
      return (
        <svg {...common}>
          {defs}
          <path
            d="M14 36c6-8 12-8 18 0s12 8 18 0"
            fill="none"
            stroke={rim}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <circle cx="20" cy="28" r="6.5" fill={tone.soft} stroke={tone.mid} strokeWidth="1.8" />
          <circle cx="44" cy="28" r="6.5" fill={tone.accent} stroke={tone.edge} strokeWidth="1.8" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          {defs}
          <path
            d="M32 9 50 18v15c0 13-11 21-18 23-7-2-18-10-18-23V18z"
            fill={fill}
            stroke={rim}
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="m23 32 6.5 6.5 13-13"
            fill="none"
            stroke={tone.edge}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "compass":
      return (
        <svg {...common}>
          {defs}
          <circle cx="32" cy="32" r="20" fill={fill} stroke={rim} strokeWidth="1.8" />
          <path
            d="m32 16 8 24-24-8 16-16z"
            fill={tone.accent}
            stroke={tone.edge}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="32" cy="32" r="3.2" fill={tone.edge} />
        </svg>
      );
    case "coins":
      return (
        <svg {...common}>
          {defs}
          <circle cx="25" cy="36" r="15" fill={fill} stroke={rim} strokeWidth="1.8" />
          <circle
            cx="41"
            cy="28"
            r="15"
            fill={tone.accent}
            stroke={tone.edge}
            strokeWidth="1.8"
          />
          <path d="M41 21v14M34 28h14" stroke={tone.edge} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          {defs}
          <circle cx="21" cy="24" r="7.5" fill={tone.soft} stroke={tone.mid} strokeWidth="1.7" />
          <circle cx="43" cy="24" r="7.5" fill={tone.soft} stroke={tone.mid} strokeWidth="1.7" />
          <circle cx="32" cy="36" r="8.5" fill={tone.accent} stroke={tone.edge} strokeWidth="1.7" />
          <path
            d="M10 52c4-10 12-12 22-12s18 2 22 12"
            fill="none"
            stroke={tone.edge}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "grow":
      return (
        <svg {...common}>
          {defs}
          <path d="M16 44h32" stroke={tone.mid} strokeWidth="2" strokeLinecap="round" />
          <path
            d="M20 44 30 20l6 12 10-18"
            fill="none"
            stroke={rim}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "celebrate":
      return (
        <svg {...common}>
          {defs}
          <circle cx="32" cy="34" r="16" fill={fill} stroke={rim} strokeWidth="2" />
          <path
            d="m23 34 6 6 12-14"
            fill="none"
            stroke={tone.edge}
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M14 14l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill={tone.accent} />
        </svg>
      );
    case "wave":
      return (
        <svg {...common}>
          {defs}
          <path
            d="M12 34c6-10 10-10 16 0s10 10 16 0 10-10 16 0"
            fill="none"
            stroke={rim}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M12 44c6-8 10-8 16 0s10 8 16 0 10-8 16 0"
            fill="none"
            stroke={tone.accent}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "cart":
      return (
        <svg {...common}>
          {defs}
          <path
            d="M14 20h6l6 24h20l6-16H24"
            fill="none"
            stroke={rim}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="30" cy="50" r="3.5" fill={tone.accent} stroke={tone.edge} strokeWidth="1.3" />
          <circle cx="44" cy="50" r="3.5" fill={tone.accent} stroke={tone.edge} strokeWidth="1.3" />
        </svg>
      );
    case "plant":
      return (
        <svg {...common}>
          {defs}
          <path d="M32 48V26" stroke={rim} strokeWidth="2.2" strokeLinecap="round" />
          <path
            d="M32 32c-12 0-16-14-8-20 4 8 8 14 8 20z"
            fill={tone.accent}
            stroke={tone.edge}
            strokeWidth="1.3"
          />
          <path
            d="M32 36c12-2 16-14 8-20-2 8-6 14-8 20z"
            fill={tone.soft}
            stroke={tone.mid}
            strokeWidth="1.3"
          />
        </svg>
      );
  }
}

export type MotionSceneKind =
  | "home"
  | "building"
  | "finance"
  | "partners"
  | "procurement"
  | "personal"
  | "success"
  | "invite"
  | "security";

export function stickerForScene(kind: MotionSceneKind): StickerName {
  switch (kind) {
    case "home":
      return "mosaic"; /* H2 */
    case "building":
      return "home"; /* B1 */
    case "finance":
      return "coinTilt"; /* X4 */
    case "partners":
      return "ring"; /* G4 */
    case "procurement":
      return "cart";
    case "personal":
      return "wallet"; /* P1 */
    case "success":
      return "sparkOk"; /* OK2 */
    case "invite":
      return "invite";
    case "security":
      return "tower"; /* O2 */
  }
}

export function stickerForSpaceKind(
  kind: "personal" | "group" | "building" | "org",
): StickerName {
  switch (kind) {
    case "personal":
      return "wallet"; /* P1 */
    case "group":
      return "ring"; /* G4 */
    case "building":
      return "home"; /* B1 */
    case "org":
      return "tower"; /* O2 */
  }
}
