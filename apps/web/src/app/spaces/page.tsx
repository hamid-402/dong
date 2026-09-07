"use client";

import Link from "next/link";
import { spaceKindForTemplate } from "@dang/contracts";
import { useAppChrome } from "@/lib/use-app-chrome";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";
import { NAV_LABELS } from "@/lib/nav-labels";
import { EmptyHint, PageHeader, SectionCard } from "@/components/ui-blocks";

const KIND_LABEL = {
  personal: "شخصی",
  group: "گروه",
  org: "سازمان",
} as const;

export default function SpacesPage() {
  const chrome = useAppChrome();

  return (
    <div>
      <PageHeader
        eyebrow="فضاها"
        title={NAV_LABELS.spacesList}
        description="فضاهای کاری شما — انتخاب برای ورود"
        actions={
          <Link className="shell-v2__cta" href="/spaces/new">
            {NAV_LABELS.createSpace}
          </Link>
        }
      />

      {!chrome.ready ? (
        <EmptyHint loading>در حال بارگذاری…</EmptyHint>
      ) : chrome.workspaces.length === 0 ? (
        <SectionCard title="هنوز فضایی ندارید">
          <p>برای شروع یک فضای شخصی، گروهی یا سازمانی بسازید.</p>
          <Link href="/spaces/new">{NAV_LABELS.createSpace}</Link>
        </SectionCard>
      ) : (
        <ul className="spaces-list">
          {chrome.workspaces.map((ws) => {
            const kind = spaceKindForTemplate(ws.template);
            const active = ws.id === chrome.workspaceId;
            return (
              <li key={ws.id}>
                <Link
                  href={wPath(ws.slug)}
                  className={`spaces-list__item${active ? " is-active" : ""}`}
                  onClick={() => chrome.selectWorkspace(ws.id)}
                >
                  <b>{ws.name}</b>
                  <small>
                    {KIND_LABEL[kind]} · {workspaceTemplateLabel(ws.template)}
                    {active ? " · فعال" : ""}
                  </small>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
