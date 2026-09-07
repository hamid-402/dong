"use client";

import Link from "next/link";
import { PageHeader, SectionCard } from "@/components/ui-blocks";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { workspaceTemplateLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";

export default function WorkspaceSettingsPage() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const workspace =
    chrome.workspaces.find((w) => w.id === scope.workspaceId) ??
    chrome.workspaces.find((w) => w.slug === scope.slug) ??
    null;

  return (
    <div>
      <PageHeader
        eyebrow="فضا"
        title="تنظیمات فضا"
        description="مشخصات همین فضا از فهرست عضویت شما — ویرایش نام هنوز از API پشتیبانی نمی‌شود."
      />

      <SectionCard title="این فضا">
        {workspace ? (
          <dl className="spaces-list" style={{ margin: 0 }}>
            <div className="spaces-list__item" style={{ cursor: "default" }}>
              <b>{workspace.name}</b>
              <small>
                شناسه مسیر: {workspace.slug}
                {" · "}
                قالب: {workspaceTemplateLabel(workspace.template)}
              </small>
            </div>
          </dl>
        ) : (
          <p className="liveHint">نام فضا از chrome بارگذاری نشد.</p>
        )}
        <p style={{ marginTop: 12 }}>
          <Link href="/spaces">ترک / سوییچ فضا — بازگشت به همه فضاها</Link>
        </p>
      </SectionCard>

      <SectionCard title="اعضا و دعوت">
        <ul className="spaces-list">
          <li>
            <Link className="spaces-list__item" href={wPath(scope.slug, "members")}>
              <b>اعضا</b>
              <small>فهرست اعضا و نقش‌ها</small>
            </Link>
          </li>
          <li>
            <Link className="spaces-list__item" href={wPath(scope.slug, "members")}>
              <b>دعوت</b>
              <small>ساخت دعوت برای همین فضا</small>
            </Link>
          </li>
          <li>
            <Link className="spaces-list__item" href={wPath(scope.slug, "space")}>
              <b>خانهٔ فضا</b>
              <small>نمای من / گروه / سازمان</small>
            </Link>
          </li>
          <li>
            <Link className="spaces-list__item" href={wPath(scope.slug, "metrics")}>
              <b>متریک محصول</b>
              <small>شمارش قیف از audit واقعی همین فضا</small>
            </Link>
          </li>
        </ul>
      </SectionCard>
    </div>
  );
}
