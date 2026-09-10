"use client";

import Link from "next/link";
import { ShellIconSvg } from "@/components/shell/shell-icons";
import type {
  ContextualMosaicIntent,
  ContextualMosaicSection,
} from "@/lib/navigation-v2";
import styles from "./contextual-mosaic-hub.module.css";

export type ContextualMosaicFact = {
  label: string;
  value: string;
  tone?: "neutral" | "attention" | "positive";
};

const INTENT_LABEL: Record<ContextualMosaicIntent, string> = {
  record: "ثبت و پیگیری",
  decide: "نیازمند تصمیم",
  monitor: "پایش",
  manage: "مدیریت",
};

export function ContextualMosaicHub({
  sections,
  title,
  description,
  facts = {},
  compact = false,
  headingId = "contextual-mosaic-title",
}: {
  sections: ContextualMosaicSection[];
  title: string;
  description: string;
  facts?: Partial<Record<string, ContextualMosaicFact>>;
  compact?: boolean;
  headingId?: string;
}) {
  if (sections.length === 0) return null;

  return (
    <section
      className={`${styles.hub}${compact ? ` ${styles.compact}` : ""}`}
      aria-labelledby={headingId}
    >
      <header className={styles.header}>
        <div>
          <span>CONTEXTUAL MOSAIC</span>
          <h2 id={headingId}>{title}</h2>
          <p>{description}</p>
        </div>
        <small>بر اساس نوع فضا و قابلیت‌های فعال</small>
      </header>

      {sections.map((section) => (
        <div className={styles.section} key={section.key}>
          {sections.length > 1 ? <h3>{section.label}</h3> : null}
          <ul className={styles.grid}>
            {section.items.map((item, index) => {
              const fact = facts[item.key];
              return (
                <li
                  key={item.key}
                  className={index === 0 && !compact ? styles.featured : undefined}
                >
                  <Link href={item.href} className={styles.tile}>
                    <span className={styles.accent} aria-hidden />
                    <span className={styles.topline}>
                      <span className={styles.icon} aria-hidden>
                        <ShellIconSvg name={item.icon} />
                      </span>
                      <span className={styles.intent}>{INTENT_LABEL[item.intent]}</span>
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
                        <span className={styles.available}>ابزار در دسترس</span>
                      )}
                      <span className={styles.open} aria-hidden>
                        ←
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
