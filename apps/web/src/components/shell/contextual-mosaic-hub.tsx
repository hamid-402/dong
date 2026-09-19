"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent } from "react";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import type {
  ContextualMosaicIntent,
  ContextualMosaicSection,
} from "@/lib/navigation-v2";
import { rememberDestination } from "@/lib/recent-destinations";
import { TILE_GEM_PALETTES } from "@/lib/tile-gem-palettes";
import { t } from "@/lib/i18n";
import styles from "./contextual-mosaic-hub.module.css";

export type ContextualMosaicFact = {
  label: string;
  value: string;
  tone?: "neutral" | "attention" | "positive";
};

function intentLabel(intent: ContextualMosaicIntent): string {
  switch (intent) {
    case "record":
      return t("shell.intentRecord");
    case "decide":
      return t("shell.intentDecide");
    case "monitor":
      return t("shell.intentMonitor");
    case "manage":
      return t("shell.intentManage");
  }
}

function gemStyle(gemKey?: string): CSSProperties | undefined {
  const gem = TILE_GEM_PALETTES[gemKey ?? ""] ?? TILE_GEM_PALETTES.teal;
  if (!gem) return undefined;
  return {
    "--tile-gem-edge": gem.edge,
    "--tile-gem-mid": gem.mid,
    "--tile-gem-center": gem.center,
    "--tile-gem-ink": gem.ink,
  } as CSSProperties;
}

export function ContextualMosaicHub({
  sections,
  title,
  description,
  facts = {},
  compact = false,
  headingId = "contextual-mosaic-title",
  reduceMotion = false,
  pinnedHrefs,
  onTogglePin,
}: {
  sections: ContextualMosaicSection[];
  title: string;
  description: string;
  facts?: Partial<Record<string, ContextualMosaicFact>>;
  compact?: boolean;
  headingId?: string;
  /** Honor prefers-reduced-motion / overview motion toggle. */
  reduceMotion?: boolean;
  pinnedHrefs?: ReadonlySet<string>;
  onTogglePin?: (item: { key: string; label: string; href: string }) => void;
}) {
  const router = useRouter();
  if (sections.length === 0) return null;

  return (
    <section
      className={`${styles.hub}${compact ? ` ${styles.compact}` : ""}${reduceMotion ? ` ${styles.noMotion}` : ""}`}
      aria-labelledby={headingId}
    >
      {compact ? (
        <h2 id={headingId} className="visually-hidden">
          {title}
        </h2>
      ) : (
        <header className={styles.header}>
          <div>
            <span>{t("shell.workPaths")}</span>
            <h2 id={headingId}>{title}</h2>
            <p>{description}</p>
          </div>
          <small>{t("shell.basedOnCaps")}</small>
        </header>
      )}

      {sections.map((section) => (
        <div className={styles.section} key={section.key}>
          {sections.length > 1 || section.description ? (
            <header className={styles.sectionHead}>
              <h3>{section.label}</h3>
              {section.description && !compact ? <p>{section.description}</p> : null}
            </header>
          ) : null}
          <ul className={styles.grid}>
            {section.items.map((item, index) => {
              const fact = facts[item.key];
              const pinned = pinnedHrefs?.has(item.href) ?? false;
              return (
                <li
                  key={item.key}
                  className={
                    index === 0 && !compact ? "mosaic-tile--breathe" : undefined
                  }
                  style={
                    reduceMotion
                      ? undefined
                      : ({ "--tile-delay": `${Math.min(index, 7) * 40}ms` } as CSSProperties)
                  }
                >
                  <Link
                    href={item.href}
                    className={`${styles.tile} ${styles.gem} ${styles.enter}${onTogglePin ? ` ${styles.tilePinned}` : ""}`}
                    style={gemStyle(item.gemKey)}
                    onMouseEnter={() => router.prefetch(item.href)}
                    onFocus={() => router.prefetch(item.href)}
                    onClick={() =>
                      rememberDestination({
                        key: item.key,
                        label: item.label,
                        href: item.href,
                      })
                    }
                  >
                    <span className={styles.topline}>
                      <span className={styles.icon} aria-hidden>
                        <ShellIconSvg name={item.icon} />
                      </span>
                      <span className={styles.intent}>{intentLabel(item.intent)}</span>
                    </span>
                    <strong>{item.label}</strong>
                    <p>{item.summary}</p>
                    <span className={styles.footer}>
                      {fact ? (
                        <span
                          className={`${styles.fact} ${styles[`fact_${fact.tone ?? "neutral"}`]}`}
                        >
                          <b>{fact.value}</b>
                          <small>{fact.label}</small>
                        </span>
                      ) : (
                        <span className={styles.available}>{t("shell.open")}</span>
                      )}
                      <span className={styles.open} aria-hidden>
                        ←
                      </span>
                    </span>
                  </Link>
                  {onTogglePin ? (
                    <button
                      type="button"
                      className={`${styles.pin}${pinned ? ` ${styles.pinActive}` : ""}`}
                      aria-pressed={pinned}
                      aria-label={
                        pinned
                          ? `${t("shell.pinRemove")} ${item.label}`
                          : `${t("shell.pinAdd")} ${item.label}`
                      }
                      title={pinned ? t("shell.pinRemove") : t("shell.pinAdd")}
                      onClick={(event: MouseEvent<HTMLButtonElement>) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onTogglePin({
                          key: item.key,
                          label: item.label,
                          href: item.href,
                        });
                      }}
                    >
                      {pinned ? "★" : "☆"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
