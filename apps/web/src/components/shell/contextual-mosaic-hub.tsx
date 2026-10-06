"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent } from "react";
import type { SpaceKind } from "@dang/contracts";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import {
  StickerSvg,
  stickerForSpaceKind,
} from "@/components/visual/stickers";
import type {
  ContextualMosaicIntent,
  ContextualMosaicSection,
} from "@/lib/navigation-v2";
import { rememberDestination } from "@/lib/recent-destinations";
import {
  softTileHaptic,
  prefetchRoute,
  navigateWithViewTransition,
} from "@/lib/tile-press";
import { gemCssVars } from "@/lib/tile-gem-palettes";
import { t } from "@/lib/i18n";
import styles from "./contextual-mosaic-hub.module.css";

const SPACE_KIND_KEYS = new Set<string>([
  "personal",
  "group",
  "building",
  "org",
]);

function isSpaceKindKey(key: string): key is SpaceKind {
  return SPACE_KIND_KEYS.has(key);
}

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

export function ContextualMosaicHub({
  sections,
  title,
  description,
  facts = {},
  compact = false,
  weight = "primary",
  headingId = "contextual-mosaic-title",
  reduceMotion = false,
  pinnedHrefs,
  onTogglePin,
  onDestinationRemembered,
}: {
  sections: ContextualMosaicSection[];
  title: string;
  description: string;
  facts?: Partial<Record<string, ContextualMosaicFact>>;
  compact?: boolean;
  /** Visual hierarchy only — never hides tiles or links. */
  weight?: "primary" | "secondary";
  headingId?: string;
  /** Honor prefers-reduced-motion / overview motion toggle. */
  reduceMotion?: boolean;
  pinnedHrefs?: ReadonlySet<string>;
  onTogglePin?: (item: { key: string; label: string; href: string }) => void;
  onDestinationRemembered?: () => void;
}) {
  const router = useRouter();
  if (sections.length === 0) return null;

  return (
    <section
      className={`${styles.hub}${compact ? ` ${styles.compact}` : ""}${weight === "secondary" ? ` ${styles.secondary}` : ""}${reduceMotion ? ` ${styles.noMotion}` : ""}`}
      aria-labelledby={headingId}
      data-weight={weight}
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
                    className={`dang-gem ${styles.tile} ${styles.enter}${onTogglePin ? ` ${styles.tilePinned}` : ""}`}
                    style={
                      {
                        ...gemCssVars(item.gemKey),
                        ["--mosaic-vt-name" as string]: reduceMotion
                          ? "none"
                          : `mosaic-${item.key}`,
                      }
                    }
                    onMouseEnter={() => prefetchRoute(router, item.href)}
                    onFocus={() => prefetchRoute(router, item.href)}
                    onTouchStart={() => prefetchRoute(router, item.href)}
                    onPointerDown={() => softTileHaptic(reduceMotion)}
                    onClick={(event) => {
                      rememberDestination({
                        key: item.key,
                        label: item.label,
                        href: item.href,
                      });
                      onDestinationRemembered?.();
                      // Client transition when possible; allow default if modifier click.
                      if (
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey ||
                        event.button !== 0
                      ) {
                        return;
                      }
                      event.preventDefault();
                      navigateWithViewTransition(() => {
                        router.push(item.href);
                      }, reduceMotion);
                    }}
                  >
                    <span className={styles.body}>
                      <strong>{item.label}</strong>
                      <p>{item.summary}</p>
                      <span className={styles.intent}>{intentLabel(item.intent)}</span>
                    </span>
                    <span className={`dang-gem__icon dang-gem__icon--sticker ${styles.icon}`} aria-hidden>
                      {isSpaceKindKey(item.key) ? (
                        <StickerSvg
                          name={stickerForSpaceKind(item.key)}
                          size={compact ? 34 : 42}
                          animated={false}
                        />
                      ) : (
                        <ShellIconSvg name={item.icon} />
                      )}
                    </span>
                    <span className={styles.footer}>
                      {fact ? (
                        <span
                          className={`${styles.fact} ${styles[`fact_${fact.tone ?? "neutral"}`]}`}
                        >
                          <b>{fact.value}</b>
                          <small>{fact.label}</small>
                        </span>
                      ) : null}
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
