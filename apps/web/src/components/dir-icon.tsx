import type { ReactNode } from "react";

/**
 * Directional icon wrapper for RTL mirroring (dong-50 #20).
 */
export function DirIcon({
  children,
  flip = true,
}: {
  children: ReactNode;
  /** Mirror in RTL (arrows/chevrons). */
  flip?: boolean;
}) {
  return (
    <span className={flip ? "dirIconRtl dirIconRtl--flip" : "dirIconRtl"} aria-hidden>
      {children}
    </span>
  );
}
