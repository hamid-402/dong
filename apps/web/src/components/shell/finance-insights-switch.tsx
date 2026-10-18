"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LABELS } from "@/lib/nav-labels";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";
import styles from "./finance-insights-switch.module.css";

function barePath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** Compact نمودارها | ریز حساب اعضا switch for charts + statements pages. */
export function FinanceInsightsSwitch({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const chrome = useAppChrome();
  const chartsOn = chrome.capabilities?.providers?.charts === "charts_v1";
  const statementsOn =
    chrome.capabilities?.providers?.statements === "csv_json_print_v1";
  if (!chartsOn && !statementsOn) return null;

  const path = barePath(pathname);
  const base = `/w/${slug}`;
  const chartsActive =
    path === `${base}/charts` || path.startsWith(`${base}/charts/`);
  const statementsActive =
    path === `${base}/statements` || path.startsWith(`${base}/statements/`);

  return (
    <nav className={styles.switch} aria-label="گزارش و نمودار">
      {chartsOn ? (
        <Link
          href={wPath(slug, "charts")}
          className={`${styles.link}${chartsActive ? ` ${styles.linkActive}` : ""}`}
          aria-current={chartsActive ? "page" : undefined}
        >
          {NAV_LABELS.charts}
        </Link>
      ) : null}
      {statementsOn ? (
        <Link
          href={wPath(slug, "statements")}
          className={`${styles.link}${statementsActive ? ` ${styles.linkActive}` : ""}`}
          aria-current={statementsActive ? "page" : undefined}
        >
          {NAV_LABELS.statements}
        </Link>
      ) : null}
    </nav>
  );
}
