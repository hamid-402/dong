"use client";

import type { ReactNode } from "react";
import styles from "./space-home.module.css";

export type SpaceHomeKeyTone = "credit" | "debt" | "settled" | "neutral";

/**
 * Hero figure for space home — one primary amount + optional meta lines.
 */
export function SpaceHomeKeyNumber({
  label,
  amount,
  tone = "neutral",
  meta,
}: {
  label: string;
  amount: ReactNode;
  tone?: SpaceHomeKeyTone;
  meta?: ReactNode;
}) {
  const dataTone = tone === "neutral" ? "settled" : tone;
  return (
    <section className={styles.keyCard} id="home-briefing" aria-label={label}>
      <p className={styles.keyLabel}>{label}</p>
      <p className={styles.keyAmount} data-tone={dataTone}>
        {amount}
      </p>
      {meta ? <div className={styles.keyMeta}>{meta}</div> : null}
    </section>
  );
}
