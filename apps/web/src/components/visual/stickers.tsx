/** Inline SVG sticker pack — empty/tour/success (non-financial). */

export type StickerName =
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
  | "compass";

const SIZE = 56;

export function StickerSvg({
  name,
  className,
  animated = true,
}: {
  name: StickerName;
  className?: string;
  animated?: boolean;
}) {
  const cls = `dang-sticker${animated ? " dang-sticker--float" : ""}${className ? ` ${className}` : ""}`;
  const common = {
    width: SIZE,
    height: SIZE,
    viewBox: "0 0 64 64",
    className: cls,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "ledger":
      return (
        <svg {...common}>
          <rect x="12" y="10" width="40" height="44" rx="6" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="M20 22h24M20 32h24M20 42h14" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="46" cy="44" r="8" fill="var(--gold)" opacity="0.9" />
        </svg>
      );
    case "scale":
      return (
        <svg {...common}>
          <path d="M32 12v36M18 24h28" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M18 24c0 8 6 14 14 14s14-6 14-14" fill="none" stroke="var(--gold)" strokeWidth="2" />
          <circle cx="18" cy="24" r="4" fill="var(--danger)" />
          <circle cx="46" cy="24" r="4" fill="var(--primary)" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="18" y="28" width="28" height="22" rx="5" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="M24 28v-6a8 8 0 0 1 16 0v6" fill="none" stroke="var(--gold)" strokeWidth="2.5" />
          <circle cx="32" cy="40" r="3" fill="var(--primary)" />
        </svg>
      );
    case "invite":
      return (
        <svg {...common}>
          <rect x="10" y="18" width="44" height="30" rx="5" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="m10 22 22 14 22-14" fill="none" stroke="var(--gold)" strokeWidth="2" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="20" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="m22 33 7 7 14-16" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M40 26a8 8 0 1 0-16 0c0 10-4 10-4 13h24c0-3-4-3-4-13" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="M28 44h8" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="14" y="16" width="36" height="34" rx="5" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="M14 26h36M24 12v8M40 12v8" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />
          <circle cx="26" cy="36" r="2.5" fill="var(--primary)" />
          <circle cx="36" cy="36" r="2.5" fill="var(--primary)" />
        </svg>
      );
    case "spark":
      return (
        <svg {...common}>
          <path d="M32 10l3 14 14 3-14 3-3 14-3-14-14-3 14-3z" fill="var(--gold)" stroke="var(--primary)" strokeWidth="1.5" />
        </svg>
      );
    case "folder":
      return (
        <svg {...common}>
          <path d="M12 22h16l4 4h20v24H12z" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="M12 30h40" stroke="var(--gold)" strokeWidth="2" />
        </svg>
      );
    case "handshake":
      return (
        <svg {...common}>
          <path d="M14 34c6-8 12-8 18 0s12 8 18 0" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="20" cy="28" r="6" fill="var(--primary-soft)" stroke="var(--gold)" strokeWidth="2" />
          <circle cx="44" cy="28" r="6" fill="var(--primary-soft)" stroke="var(--gold)" strokeWidth="2" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M32 10 48 18v14c0 12-10 20-16 22-6-2-16-10-16-22V18z" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="m24 32 6 6 12-12" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "compass":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="18" fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth="2" />
          <path d="m32 18 6 20-20-6 14-14z" fill="var(--gold)" opacity="0.9" />
          <circle cx="32" cy="32" r="3" fill="var(--primary)" />
        </svg>
      );
  }
}
