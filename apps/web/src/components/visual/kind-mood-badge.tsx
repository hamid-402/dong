"use client";

import type { SpaceKind } from "@dang/contracts";
import { StickerSvg, stickerForSpaceKind } from "@/components/visual/stickers";
import styles from "./kind-mood-badge.module.css";

/**
 * Kind mark beside titles — static (no continuous motion in dense lists).
 */
export function KindMoodBadge({
  kind,
  size = 28,
  className,
}: {
  kind: SpaceKind;
  size?: number;
  className?: string;
}) {
  const sticker = stickerForSpaceKind(kind);
  return (
    <span
      className={[styles.badge, className].filter(Boolean).join(" ")}
      aria-hidden
      data-kind={kind}
    >
      <StickerSvg name={sticker} size={size} animated={false} />
    </span>
  );
}
