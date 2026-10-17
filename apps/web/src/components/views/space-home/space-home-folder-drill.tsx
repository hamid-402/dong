"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./space-home.module.css";

export type SpaceHomeFolderDestination = {
  key: string;
  label: string;
  hint: string;
  href: string;
};

export type SpaceHomeFolderGroup = {
  key: string;
  label: string;
  hint?: string;
  items: SpaceHomeFolderDestination[];
};

/**
 * Calm folder drill for /w/<slug>?folder=<key> — header + grouped list, no tiles.
 */
export function SpaceHomeFolderDrill({
  title,
  backHref,
  backLabel = "بازگشت به خانهٔ فضا",
  groups,
  emptyHint,
}: {
  title: string;
  backHref: string;
  backLabel?: string;
  groups: SpaceHomeFolderGroup[];
  emptyHint?: ReactNode;
}) {
  const hasItems = groups.some((g) => g.items.length > 0);

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerLead}>
          <Link href={backHref} className={styles.backLink}>
            ← {backLabel}
          </Link>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{title}</h1>
          </div>
        </div>
      </header>

      {!hasItems ? (
        emptyHint ?? <p className={styles.calmEmpty}>در این پوشه مسیری نیست.</p>
      ) : (
        <div className={styles.folderGroups}>
          {groups.map((group) =>
            group.items.length === 0 ? null : (
              <section
                key={group.key}
                className={styles.section}
                aria-labelledby={`folder-group-${group.key}`}
              >
                <h2 id={`folder-group-${group.key}`} className={styles.sectionTitle}>
                  {group.label}
                </h2>
                {group.hint ? <p className={styles.calmEmpty}>{group.hint}</p> : null}
                <ul className={styles.list}>
                  {group.items.map((item) => (
                    <li key={item.key} className={styles.listItem}>
                      <div className={styles.listCopy}>
                        <strong>
                          <Link href={item.href} className={styles.destLink}>
                            {item.label}
                          </Link>
                        </strong>
                        {item.hint ? <small>{item.hint}</small> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}
