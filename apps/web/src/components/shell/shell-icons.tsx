/** Shared shell icons — used by AppShellV2, tools tiles, and classic AppShell. */

export type ShellIcon =
  | "home"
  | "wallet"
  | "cart"
  | "box"
  | "partners"
  | "settings"
  | "search"
  | "bell"
  | "receipt";

export function ShellIconSvg({ name }: { name: ShellIcon }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M16 11h5" />
        </svg>
      );
    case "cart":
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1" />
          <circle cx="18" cy="20" r="1" />
          <path d="M3 4h2l2.5 11h10l3-8H7" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M4 7h16v13H4z" />
          <path d="m8 7 1-3h6l1 3M9 12h6" />
        </svg>
      );
    case "partners":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M3 20v-1a6 6 0 0 1 12 0v1" />
          <path d="M15 20v-1a5 5 0 0 1 6 0v1" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...common}>
          <path d="M7 3h10l2 4v14H5V7l2-4Z" />
          <path d="M9 11h6M9 15h4" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3" />
          <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
        </svg>
      );
  }
}
