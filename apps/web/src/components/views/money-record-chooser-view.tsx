"use client";

import Link from "next/link";
import { spaceKindForTemplate } from "@dang/contracts";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import { useAppChrome } from "@/lib/use-app-chrome";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";

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
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: 12,
          }}
        >
          {choices.map((choice) => {
            if (!slug) return null;
            const base = wPath(slug, choice.page);
            const href = choice.hash ? `${base}#${choice.hash}` : base;
            return (
              <li key={choice.key}>
                <Link
                  href={href}
                  style={{
                    display: "block",
                    padding: "16px 18px",
                    borderRadius: 12,
                    border: choice.job
                      ? "2px solid color-mix(in srgb, var(--primary) 45%, var(--line))"
                      : "1px solid var(--line)",
                    background: choice.job
                      ? "color-mix(in srgb, var(--primary) 8%, var(--surface))"
                      : "var(--surface)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 4 }}>
                    {choice.title}
                  </strong>
                  <span style={{ color: "var(--muted)", fontSize: "0.92rem" }}>
                    {choice.summary}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </WorkspacePageFrame>
    </AppShell>
  );
}
