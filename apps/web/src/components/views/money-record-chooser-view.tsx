"use client";

import Link from "next/link";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { AppShell } from "@/components/app-shell";
import { useAppChrome } from "@/lib/use-app-chrome";
import { wPath } from "@/lib/workspace-paths";

const CHOICES: Array<{
  page: "expenses" | "ledger" | "payments";
  hash?: string;
  title: string;
  summary: string;
}> = [
  {
    page: "expenses",
    hash: "quick-expense",
    title: "خرج تک‌قلم",
    summary: "یک خرج با سهم اعضا، رسید و ثبت در دفترکل",
  },
  {
    page: "ledger",
    title: "دفتر روزانه",
    summary: "چند قلم در یک روز؛ ویرایش یعنی برگشت دفترکل",
  },
  {
    page: "payments",
    title: "شارژ / برداشت تنخواه",
    summary: "موجودی صندوق با سهم اعضا؛ لینک به خرج",
  },
];

export function MoneyRecordChooserView() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const slug =
    scope.slug ||
    chrome.workspaces.find((w) => w.id === chrome.workspaceId)?.slug ||
    "";

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <WorkspacePageFrame
        title="ثبت پول"
        description="مسیر مناسب را انتخاب کنید — هر سه به دفترکل واقعی وصل‌اند"
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
          {CHOICES.map((choice) => {
            if (!slug) return null;
            const base = wPath(slug, choice.page);
            const href = choice.hash ? `${base}#${choice.hash}` : base;
            return (
              <li key={choice.title}>
                <Link
                  href={href}
                  style={{
                    display: "block",
                    padding: "16px 18px",
                    borderRadius: 12,
                    border: "1px solid var(--line)",
                    background: "var(--surface, #fff)",
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
