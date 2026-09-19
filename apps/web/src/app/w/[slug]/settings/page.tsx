"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { MembershipRole, WorkspacePayoutInstructions, WorkspaceSummary } from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import { FormStack, EmptyHint, SectionCard, StatusLine, StatusPill } from "@/components/ui-blocks";
import { WorkspacePageFrame } from "@/components/shell/workspace-page-frame";
import { GroupPublicIdCard } from "@/components/shell/group-public-id";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useWorkspaceScope } from "@/components/shell/workspace-scope";
import { membershipRoleLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { FlashMessages } from "@/lib/use-flash-message";
import { NAV_LABELS } from "@/lib/nav-labels";
import { t } from "@/lib/i18n";
import styles from "./settings.module.css";

function normalizePayoutValue(kind: "card" | "iban", raw: string): string {
  const trimmed = raw.replace(/\s|-/g, "").trim();
  if (kind === "iban") return trimmed.toUpperCase();
  return trimmed;
}

function isValidPayoutValue(kind: "card" | "iban", value: string): boolean {
  if (kind === "card") return /^\d{16}$/.test(value);
  return /^IR\d{24}$/.test(value);
}

function maskPayoutValue(kind: "card" | "iban", value: string): string {
  if (kind === "card" && value.length >= 4) {
    return `${value.slice(0, 4)} ···· ···· ${value.slice(-4)}`;
  }
  if (kind === "iban" && value.length >= 8) {
    return `${value.slice(0, 4)} ··· ${value.slice(-4)}`;
  }
  return value;
}

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
    chromeWorkspace?.displayUnit ?? "rial",
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadAttempted, setLoadAttempted] = useState(false);
  const [payout, setPayout] = useState<WorkspacePayoutInstructions | null>(null);
  const [holderName, setHolderName] = useState("");
  const [destinationKind, setDestinationKind] = useState<"card" | "iban">("card");
  const [destinationValue, setDestinationValue] = useState("");
  const [bankName, setBankName] = useState("");

  const payoutLive = chrome.capabilities?.providers?.payoutInstructions === "workspace_v1";

  function loadSettings() {
    if (!scope.workspaceId) return;
    void Promise.all([
      api.getWorkspace(scope.workspaceId),
      api.listMembers(scope.workspaceId),
      payoutLive
        ? api.getPayoutInstructions(scope.workspaceId).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([next, members, payoutRow]) => {
        setWorkspace(next);
        setName(next.name);
        setTimezone(next.timezone);
        setDisplayUnit(next.displayUnit);
        setRole(members.find((member) => member.userId === chrome.actor?.userId)?.role ?? null);
        setPayout(payoutRow);
        if (payoutRow) {
          setHolderName(payoutRow.holderName);
          setDestinationKind(payoutRow.destinationKind);
          setDestinationValue(payoutRow.destinationValue);
          setBankName(payoutRow.bankName ?? "");
        }
        setError(null);
      })
      .catch((reason: unknown) => {
        setError(friendlyErrorMessage(reason, "بارگذاری تنظیمات ناموفق بود"));
      })
      .finally(() => setLoadAttempted(true));
  }

  useEffect(() => {
    loadSettings();
  }, [chrome.actor?.userId, scope.workspaceId, payoutLive]);

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
          setError(friendlyErrorMessage(reason, "ذخیره تنظیمات ناموفق بود"));
        });
    });
  }

  function savePayout() {
    if (!workspace || !canEdit || !payoutLive) return;
    const normalized = normalizePayoutValue(destinationKind, destinationValue);
    if (!isValidPayoutValue(destinationKind, normalized)) {
      setSuccess(null);
      setError(
        destinationKind === "iban"
          ? t("settings.payoutInvalidIban")
          : t("settings.payoutInvalidCard"),
      );
      return;
    }
    startTransition(() => {
      void api
        .upsertPayoutInstructions(workspace.id, {
          holderName: holderName.trim(),
          destinationKind,
          destinationValue: normalized,
          bankName: bankName.trim() || undefined,
        })
        .then((saved) => {
          setPayout(saved);
          setHolderName(saved.holderName);
          setDestinationKind(saved.destinationKind);
          setDestinationValue(saved.destinationValue);
          setBankName(saved.bankName ?? "");
          setSuccess(t("settings.payoutSaved"));
          setError(null);
        })
        .catch((reason: unknown) => {
          setSuccess(null);
          setError(friendlyErrorMessage(reason, t("settings.payoutSaveError")));
        });
    });
  }

  function clearPayout() {
    if (!workspace || !canEdit || !payoutLive || !payout) return;
    if (!window.confirm(t("settings.payoutClearConfirm"))) return;
    startTransition(() => {
      void api
        .clearPayoutInstructions(workspace.id)
        .then((result) => {
          if (result.cleared) {
            setPayout(null);
            setHolderName("");
            setDestinationValue("");
            setBankName("");
            setSuccess(t("settings.payoutCleared"));
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          setSuccess(null);
          setError(friendlyErrorMessage(reason, t("settings.payoutClearError")));
        });
    });
  }

  return (
    <WorkspacePageFrame
      title={NAV_LABELS.settings}
      description="نام، منطقه زمانی، واحد نمایش و دستور واریز صورتحساب."
      primaryAction={
        canEdit ? (
          <Button
            type="button"
            onClick={saveWorkspace}
            disabled={!canEdit || pending || name.trim().length < 2 || !workspace}
          >
            {pending ? "در حال ذخیره…" : "ذخیره مشخصات فضا"}
          </Button>
        ) : (
          <Link href={wPath(scope.slug, "members")}>{NAV_LABELS.members}</Link>
        )
      }
      secondaryActions={
        workspace &&
        (spaceKindForTemplate(workspace.template) === "building" ||
          spaceKindForTemplate(workspace.template) === "org") ? (
          <Link href={wPath(scope.slug, "subunits")}>{NAV_LABELS.subunits}</Link>
        ) : undefined
      }
      state={
        !loadAttempted || (!workspace && !error)
          ? "loading"
          : loadAttempted && error && !workspace
            ? "error"
            : "ready"
      }
      loadingLabel="در حال بارگذاری تنظیمات فضا…"
      skeletonRows={4}
      error={
        <StatusLine>
          {error ?? "بارگذاری تنظیمات ناموفق بود."}{" "}
          <Button type="button" variant="secondary" onClick={loadSettings} disabled={pending}>
            تلاش دوباره
          </Button>
        </StatusLine>
      }
    >
      <FlashMessages error={error} successMessage={success} />

      {workspace &&
      (spaceKindForTemplate(workspace.template) === "group" ||
        spaceKindForTemplate(workspace.template) === "building" ||
        spaceKindForTemplate(workspace.template) === "org") ? (
        <GroupPublicIdCard slug={workspace.slug} name={workspace.name} />
      ) : workspace ? (
        <GroupPublicIdCard slug={workspace.slug} name={workspace.name} compact />
      ) : null}

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
                  <option value="rial">ریال (پیش‌فرض)</option>
                  <option value="toman">تومان</option>
                </SelectField>
                {canEdit ? (
                  <StatusLine>
                    اقدام اصلی ذخیره در نوار عنوان صفحه است — از همان‌جا مشخصات را ثبت کنید.
                  </StatusLine>
                ) : null}
              </FormStack>
            </>
          ) : (
            <EmptyHint>مشخصات فضا در دسترس نیست.</EmptyHint>
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

      <SectionCard
        id="payout"
        title={t("settings.payoutTitle")}
        description={t("settings.payoutDescription")}
      >
        {!payoutLive ? (
          <EmptyHint>{t("settings.payoutCapabilityOff")}</EmptyHint>
        ) : (
          <FormStack>
            {!payout ? <StatusLine>{t("settings.payoutUnset")}</StatusLine> : null}
            {payout ? (
              <StatusLine>
                {t("settings.payoutPreview")}:{" "}
                {maskPayoutValue(payout.destinationKind, payout.destinationValue)}
              </StatusLine>
            ) : null}
            <TextField
              id="payout-holder"
              label={t("settings.payoutHolder")}
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              disabled={!canEdit || pending}
            />
            <SelectField
              id="payout-kind"
              label={t("settings.payoutKind")}
              value={destinationKind}
              onChange={(e) => setDestinationKind(e.target.value as "card" | "iban")}
              disabled={!canEdit || pending}
            >
              <option value="card">{t("settings.payoutCard")}</option>
              <option value="iban">{t("settings.payoutIban")}</option>
            </SelectField>
            <TextField
              id="payout-value"
              label={t("settings.payoutValue")}
              value={destinationValue}
              onChange={(e) => setDestinationValue(e.target.value)}
              disabled={!canEdit || pending}
              hint={
                destinationKind === "iban"
                  ? t("settings.payoutIbanHint")
                  : t("settings.payoutCardHint")
              }
              autoComplete="off"
              inputMode={destinationKind === "card" ? "numeric" : "text"}
            />
            <TextField
              id="payout-bank"
              label={t("settings.payoutBank")}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              disabled={!canEdit || pending}
            />
            {canEdit ? (
              <>
                <Button
                  type="button"
                  onClick={savePayout}
                  disabled={pending || holderName.trim().length < 2 || destinationValue.trim().length < 2}
                >
                  {pending ? "…" : t("settings.payoutSave")}
                </Button>
                {payout ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={clearPayout}
                    disabled={pending}
                  >
                    {t("settings.payoutClear")}
                  </Button>
                ) : null}
              </>
            ) : (
              <StatusLine>{t("settings.payoutReadOnlyHint")}</StatusLine>
            )}
          </FormStack>
        )}
      </SectionCard>

      <SectionCard title="اعضا، دسترسی و مشاهده‌پذیری">
        <div className={styles.routeGrid}>
          <Link href={wPath(scope.slug, "members")}>
            <b>اعضا و دعوت‌ها</b>
            <small>مدیریت نقش، سهم پیش‌فرض و دعوت واقعی</small>
          </Link>
          {workspace &&
          (spaceKindForTemplate(workspace.template) === "building" ||
            spaceKindForTemplate(workspace.template) === "org") ? (
            <Link href={wPath(scope.slug, "subunits")}>
              <b>{NAV_LABELS.subunits}</b>
              <small>
                {spaceKindForTemplate(workspace.template) === "building"
                  ? "واحدها و ساکنان هر واحد برای شارژ و قبوض"
                  : "بخش‌ها و شرکت‌های زیرمجموعه با افراد جدا"}
              </small>
            </Link>
          ) : null}
          <Link href={wPath(scope.slug, "statements")}>
            <b>{NAV_LABELS.statements}</b>
            <small>صورتحساب بازهٔ دلخواه با دستور واریز</small>
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
    </WorkspacePageFrame>
  );
}
