"use client";

import Link from "next/link";
import { spaceKindForTemplate } from "@dang/contracts";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import { useAppChrome } from "@/lib/use-app-chrome";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";
import styles from "@/components/shell/money-entry-chooser.module.css";

type Choice = {
  key: string;
  page: "expenses" | "ledger" | "payments";
  hash?: string;
  title: string;
  summary: string;
  /** Primary job cards for clarity design. */
  job?: boolean;
};

export function MoneyRecordChooserView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const slug =
    scope.slug ||
    chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.slug ||
    "";
  const ws =
    chrome.workspaces.find((w) => w.slug === slug) ||
    chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const kind = spaceKindForTemplate(ws?.template);
  const showLedger = kind !== "personal";

  const choices: Choice[] = [
    ...(showLedger
      ? [
          {
            key: "daily",
            page: "ledger" as const,
            title: NAV_LABELS.dailyEntry,
            summary:
              "تیک روز×عضو برای مصرف تکراری — کاتالوگ و Dong-To از همین مسیر",
            job: true,
          },
        ]
      : []),
    {
      key: "full",
      page: "expenses",
      hash: "quick-expense",
      title: NAV_LABELS.fullExpense,
      summary: "تقسیم سهم، تأیید، مرکز هزینه و خرج رویدادمحور",
      job: true,
    },
    {
      key: "list",
      page: "expenses",
      title: `فهرست ${NAV_LABELS.expenses}`,
      summary: "همهٔ پول‌های ثبت‌شده (روزانه و کامل) — جزئیات، برگشت و اصلاح",
    },
    {
      key: "treasury",
      page: "payments",
      title: "شارژ / برداشت تنخواه",
      summary: "موجودی صندوق با سهم اعضا؛ لینک به خرج",
    },
  ];

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title={NAV_LABELS.addExpense}
        description="ثبت روزانه برای مصرف تکراری؛ خرج کامل برای تقسیم و جزئیات. هر دو در مانده می‌آیند."
        state="ready"
      >
        <ul className={styles.recordList}>
          {choices.map((choice) => {
            if (!slug) return null;
            const base = wPath(slug, choice.page);
            const href = choice.hash ? `${base}#${choice.hash}` : base;
            return (
              <li key={choice.key}>
                <Link
                  href={href}
                  className={`${styles.recordCard}${choice.job ? ` ${styles.recordCardJob}` : ""}`}
                >
                  <strong>{choice.title}</strong>
                  <span>{choice.summary}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </WorkspacePageFrame>
    </AppShell>
  );
}
