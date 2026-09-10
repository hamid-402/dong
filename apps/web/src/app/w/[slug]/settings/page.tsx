"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { MembershipRole, WorkspaceSummary } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { FormStack, EmptyHint, SectionCard, StatusPill } from "@/components/ui-blocks";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { membershipRoleLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";
import { api } from "@/lib/api";
import { FlashMessages } from "@/lib/use-flash-message";
import styles from "./settings.module.css";

export default function WorkspaceSettingsPage() {
  const chrome = useAppChrome();
  const scope = useWorkspaceScope();
  const chromeWorkspace =
    chrome.workspaces.find((w) => w.id === scope.workspaceId) ??
    chrome.workspaces.find((w) => w.slug === scope.slug) ??
    null;
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(chromeWorkspace);
  const [role, setRole] = useState<MembershipRole | null>(null);
  const [name, setName] = useState(chromeWorkspace?.name ?? "");
  const [timezone, setTimezone] = useState(chromeWorkspace?.timezone ?? "Asia/Tehran");
  const [displayUnit, setDisplayUnit] = useState<"toman" | "rial">(
    chromeWorkspace?.displayUnit ?? "toman",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!scope.workspaceId) return;
    void Promise.all([
      api.getWorkspace(scope.workspaceId),
      api.listMembers(scope.workspaceId),
    ])
      .then(([next, members]) => {
        setWorkspace(next);
        setName(next.name);
        setTimezone(next.timezone);
        setDisplayUnit(next.displayUnit);
        setRole(members.find((member) => member.userId === chrome.actor?.userId)?.role ?? null);
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "بارگذاری تنظیمات ناموفق بود");
      });
  }, [chrome.actor?.userId, scope.workspaceId]);

  const canEdit = role === "owner" || role === "admin";

  function saveWorkspace() {
    if (!workspace || !canEdit) return;
    startTransition(() => {
      void api
        .updateWorkspace(workspace.id, { name, timezone, displayUnit })
        .then((next) => {
          setWorkspace(next);
          setName(next.name);
          setSuccess("مشخصات فضای کاری ذخیره شد");
          setError(null);
          chrome.refreshChrome();
        })
        .catch((reason: unknown) => {
          setSuccess(null);
          setError(reason instanceof Error ? reason.message : "ذخیره تنظیمات ناموفق بود");
        });
    });
  }

  return (
    <div>
      <FlashMessages error={error} successMessage={success} />

      {workspace ? (
        <OperationsModuleHeader
          ariaLabel="تنظیمات فضای کاری"
          destinations={[
            { key: "settings", label: "تنظیمات", href: wPath(scope.slug, "settings"), active: true },
            { key: "members", label: "اعضا", href: wPath(scope.slug, "members"), active: false },
            { key: "space", label: "نمای فضا", href: wPath(scope.slug, "space"), active: false },
            { key: "audit", label: "تاریخچه", href: wPath(scope.slug, "audit"), active: false },
            { key: "metrics", label: "متریک محصول", href: wPath(scope.slug, "metrics"), active: false },
          ]}
          metrics={[
            { label: "نام فضا", value: workspace.name, detail: "از عضویت احراز‌شده" },
            { label: "الگو", value: workspaceTemplateLabel(workspace.template), detail: "تعیین‌کننده ماژول‌ها" },
            { label: "شناسه مسیر", value: workspace.slug, detail: "مسیر canonical فضای کاری" },
            { label: "ذخیره‌سازی", value: chrome.persistenceLabel, detail: "از capabilities runtime" },
          ]}
          roleLabel={role ? membershipRoleLabel(role) : null}
          persistenceLabel={chrome.persistenceLabel}
          pending={!chrome.ready || pending}
          onRefresh={() => chrome.refreshChrome()}
        />
      ) : (
        <EmptyHint loading>در حال بارگذاری تنظیمات فضا…</EmptyHint>
      )}

      <div className={styles.layout}>
        <SectionCard title="پروفایل فضای کاری">
          {workspace ? (
            <>
              <div className={styles.editStatus}>
                <div>
                  <b>{canEdit ? "ویرایش مدیریتی فعال است" : "دسترسی فقط‌خواندنی"}</b>
                  <small>
                    {canEdit
                      ? "تغییرات در API ذخیره و در audit trail ثبت می‌شوند."
                      : "ویرایش این بخش فقط برای مالک و مدیر فضا مجاز است."}
                  </small>
                </div>
                <StatusPill tone={canEdit ? "ok" : "warn"}>
                  {role ? membershipRoleLabel(role) : "در حال تشخیص نقش"}
                </StatusPill>
              </div>

              <FormStack>
                <TextField
                  id="workspace-settings-name"
                  label="نام فضای کاری"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canEdit || pending}
                  hint="بین ۲ تا ۸۰ کاراکتر؛ در پوسته و فهرست فضاها نمایش داده می‌شود."
                />
                <SelectField
                  id="workspace-settings-timezone"
                  label="منطقه زمانی عملیاتی"
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  disabled={!canEdit || pending}
                >
                  <option value="Asia/Tehran">تهران (Asia/Tehran)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">لندن</option>
                  <option value="Europe/Berlin">برلین</option>
                  <option value="America/Toronto">تورنتو</option>
                </SelectField>
                <SelectField
                  id="workspace-settings-display-unit"
                  label="واحد نمایش مبلغ"
                  value={displayUnit}
                  onChange={(event) => setDisplayUnit(event.target.value as "toman" | "rial")}
                  disabled={!canEdit || pending}
                >
                  <option value="toman">تومان</option>
                  <option value="rial">ریال</option>
                </SelectField>
                <Button
                  type="button"
                  onClick={saveWorkspace}
                  disabled={!canEdit || pending || name.trim().length < 2}
                >
                  {pending ? "در حال ذخیره…" : "ذخیره مشخصات فضا"}
                </Button>
              </FormStack>
            </>
          ) : (
            <p className="liveHint">در حال بارگذاری مشخصات فضا…</p>
          )}
        </SectionCard>

        <aside className={styles.inspector} aria-label="هویت ثابت فضای کاری">
          <span>هویت و معماری ثابت</span>
          {workspace ? (
            <dl>
              <div>
                <dt>شناسه مسیر</dt>
                <dd>{workspace.slug}</dd>
              </div>
              <div>
                <dt>قالب فضا</dt>
                <dd>{workspaceTemplateLabel(workspace.template)}</dd>
              </div>
              <div>
                <dt>شناسه داخلی</dt>
                <dd>{workspace.id}</dd>
              </div>
              <div>
                <dt>پایداری runtime</dt>
                <dd>{chrome.persistenceLabel}</dd>
              </div>
            </dl>
          ) : null}
          <p>
            شناسه مسیر و قالب از این فرم تغییر نمی‌کنند تا مسیرها، دسترسی‌ها و داده‌های ماژول‌ها
            بدون مهاجرت ناخواسته باقی بمانند.
          </p>
          <Link href="/spaces">مشاهده و سوییچ بین همه فضاها</Link>
        </aside>
      </div>

      <SectionCard title="اعضا، دسترسی و مشاهده‌پذیری">
        <div className={styles.routeGrid}>
          <Link href={wPath(scope.slug, "members")}>
            <b>اعضا و دعوت‌ها</b>
            <small>مدیریت نقش، سهم پیش‌فرض و دعوت واقعی</small>
          </Link>
          <Link href={wPath(scope.slug, "space")}>
            <b>خانهٔ فضا</b>
            <small>نمای متناسب با نوع فضای کاری</small>
          </Link>
          <Link href={wPath(scope.slug, "metrics")}>
            <b>متریک محصول</b>
            <small>قیف محاسبه‌شده از audit همین فضا</small>
          </Link>
          <Link href={wPath(scope.slug, "audit")}>
            <b>تاریخچه عملیات</b>
            <small>رخدادهای واقعی ثبت‌شده در backend</small>
          </Link>
        </div>
      </SectionCard>
    </div>
  );
}
