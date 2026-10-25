"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import type {
  AuthMeResponse,
  WorkspaceSummary,
  WorkspaceTemplate,
  WorkspaceTemplateCatalogItem,
} from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
import { Button, SelectField, TextField } from "@dang/ui";
import styles from "./onboarding-view.module.css";
import { GroupCreatedNext } from "@/components/create-group-form";
import { AppShell } from "@/components/app-shell";
import { GroupEmailVerificationNotice } from "@/components/group-email-verification-notice";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusPill,
} from "@/components/ui-blocks";
import { api, DEV_IDENTITY_DEFAULTS, getDevIdentity, setDevIdentity } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { authModeLabel, workspaceTemplateLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { createWorkspaceWithUniqueSlug } from "@/lib/group-slug";
import { newClientId } from "@/lib/id";
import { NAV_LABELS } from "@/lib/nav-labels";
import { canonicalHref } from "@/lib/workspace-paths";

const ONBOARDING_STEPS_TAIL = [
  "فضا ساخته می‌شود و خانهٔ آن با کارت‌های مالی، خرید و فضاها باز می‌شود",
  "از خانه اعضا را دعوت کنید یا با ＋ اولین خرج را ثبت کنید — فهرست همهٔ فضاها در /home",
] as const;

/** Real catalog only — never invent a fake template when the API is empty or filtered out. */
export function filterVisibleTemplates(
  templates: WorkspaceTemplateCatalogItem[],
  kindFilter: "personal" | "group" | "building" | "org" | null,
): WorkspaceTemplateCatalogItem[] {
  return templates.filter(
    (item) => !kindFilter || spaceKindForTemplate(item.id) === kindFilter,
  );
}

/** UI-only blank option — not a catalog row; create maps to friends_family. */
export const BLANK_SPACE_SELECTION = "blank" as const;
export type TemplateSelection = WorkspaceTemplate | typeof BLANK_SPACE_SELECTION;

/** Resolve UI selection to the real API template (blank → friends_family). */
export function templateForCreate(selection: TemplateSelection): WorkspaceTemplate {
  return selection === BLANK_SPACE_SELECTION ? "friends_family" : selection;
}

/** Payload for blank-space create — uses a real template id, not a fake catalog item. */
export function blankSpaceCreateBody(name: string): {
  name: string;
  template: "friends_family";
  ownerDefaultShares: 1;
} {
  return {
    name: name.trim(),
    template: "friends_family",
    ownerDefaultShares: 1,
  };
}

/** Submit is not gated on catalog readiness — blank space works without templates. */
export function isSpaceCreateSubmitEnabled(input: {
  pending: boolean;
  catalogReady: boolean;
}): boolean {
  void input.catalogReady;
  return !input.pending;
}

export function OnboardingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [templates, setTemplates] = useState<WorkspaceTemplateCatalogItem[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const kindHint = searchParams.get("kind");
  const templateHint = searchParams.get("template");
  const defaultSelection: TemplateSelection =
    templateHint === "personal" ||
    templateHint === "friends_family" ||
    templateHint === "household" ||
    templateHint === "residential_building" ||
    templateHint === "project_partners" ||
    templateHint === "small_team" ||
    templateHint === "construction"
      ? templateHint
      : kindHint === "personal"
        ? "personal"
        : kindHint === "building"
          ? "residential_building"
          : kindHint === "org"
            ? "small_team"
            : BLANK_SPACE_SELECTION;
  const [selection, setSelection] = useState<TemplateSelection>(defaultSelection);
  const [subject, setSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [displayName, setDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [initialLoading, setInitialLoading] = useState(true);
  const [allowDevAuth, setAllowDevAuth] = useState(false);
  const [created, setCreated] = useState<WorkspaceSummary | null>(null);
  const [pending, startTransition] = useTransition();

  async function loadTemplatesCatalog(): Promise<void> {
    setTemplatesLoading(true);
    try {
      const templateResponse = await api.templates();
      setTemplates(templateResponse);
      setTemplatesError(null);
    } catch (err: unknown) {
      setTemplates([]);
      setTemplatesError(friendlyErrorMessage(err, "بارگذاری قالب‌ها ناموفق بود"));
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    const identity = getDevIdentity();
    setSubject(identity.subject);
    setDisplayName(identity.displayName);
    let cancelled = false;
    void (async () => {
      try {
        await loadTemplatesCatalog();
        if (cancelled) return;
        setAllowDevAuth(chrome.allowDevAuth);
        if (chrome.actor) {
          setMe({
            actor: chrome.actor,
            workspaces: chrome.workspaces,
          });
        } else {
          setMe(await api.me());
        }
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(friendlyErrorMessage(err, "خطای ناشناخته"));
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chrome.ready, chrome.allowDevAuth, chrome.actor, chrome.workspaces]);

  function refresh() {
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(subject.trim() || "dev-local-user", displayName.trim() || "کاربر محلی");
          const meResponse = await api.me();
          setMe(meResponse);
          setError(null);
          flashSuccess("هویت به‌روز شد");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }

  function goToWorkspaceHome(workspace: WorkspaceSummary) {
    chrome.selectWorkspace(workspace.id);
    chrome.refreshChrome();
    router.push(canonicalHref("space", workspace.slug));
  }

  function goToWorkspaceFinance(workspace: WorkspaceSummary) {
    chrome.selectWorkspace(workspace.id);
    chrome.refreshChrome();
    router.push(canonicalHref("record", workspace.slug));
  }

  function goToWorkspaceMembers(workspace: WorkspaceSummary) {
    chrome.selectWorkspace(workspace.id);
    chrome.refreshChrome();
    router.push(canonicalHref("members", workspace.slug));
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("نام را وارد کنید");
      setError(null);
      return;
    }
    setNameError(null);
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(subject.trim() || "dev-local-user", displayName.trim() || "کاربر محلی");
          const template = templateForCreate(selection);
          const workspace = await createWorkspaceWithUniqueSlug(
            selection === BLANK_SPACE_SELECTION
              ? blankSpaceCreateBody(trimmedName)
              : {
                  name: trimmedName,
                  template,
                  ...(template === "friends_family" || template === "household"
                    ? { ownerDefaultShares: 1 }
                    : {}),
                },
            (body) => api.createWorkspace(body, newClientId()),
          );
          setCreated(workspace);
          setMe(await api.me());
          chrome.selectWorkspace(workspace.id);
          chrome.refreshChrome();
          setError(null);
          flashSuccess(`فضای «${workspace.name}» ساخته شد`);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "خطای ناشناخته"));
        }
      })();
    });
  }

  const pageError = error ?? chrome.error;
  const template = templateForCreate(selection);
  const selectedTemplate =
    selection === BLANK_SPACE_SELECTION
      ? null
      : templates.find((item) => item.id === selection);
  const groupTemplate =
    template === "friends_family" || template === "household" ? template : null;
  const kindFilter =
    kindHint === "personal" ||
    kindHint === "group" ||
    kindHint === "building" ||
    kindHint === "org"
      ? kindHint
      : null;
  const visibleTemplates = useMemo(
    () => filterVisibleTemplates(templates, kindFilter),
    [templates, kindFilter],
  );
  const catalogReady = visibleTemplates.length > 0;
  const submitEnabled = isSpaceCreateSubmitEnabled({ pending, catalogReady });
  const createdFinanceHref = canonicalHref("record", created?.slug);

  useEffect(() => {
    if (selection === BLANK_SPACE_SELECTION) return;
    if (visibleTemplates.length === 0) {
      setSelection(BLANK_SPACE_SELECTION);
      return;
    }
    if (!visibleTemplates.some((t) => t.id === selection)) {
      setSelection(visibleTemplates[0]!.id);
    }
  }, [visibleTemplates, selection]);

  const titleKind =
    kindFilter &&
    visibleTemplates.some((item) => item.spaceKind === kindFilter)
      ? kindFilter
      : null;
  const offersExtendedKinds = visibleTemplates.some(
    (item) => item.spaceKind === "building" || item.spaceKind === "org",
  );
  const onboardingSteps =
    titleKind === "group" || groupTemplate
      ? ["نام گروه را بنویسید", "بعد از ساخت، شناسهٔ عمومی را برای دعوت بفرستید"]
      : [
    offersExtendedKinds
      ? "نام و قالب فضا را انتخاب کنید (شخصی / گروه / ساختمان / سازمان)"
      : templates.length > 0
        ? "نام و قالب فضا را انتخاب کنید (شخصی یا گروه)"
        : "نام و قالب فضا را انتخاب کنید",
    ...ONBOARDING_STEPS_TAIL,
  ];

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || me?.actor.displayName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <div className="workspacePageFrame">
      <PageHeader
        eyebrow="مدیریت"
        title={
          titleKind === "building"
            ? "ساخت فضای ساختمان"
            : titleKind === "org"
              ? "ساخت فضای سازمانی"
              : titleKind === "personal"
                ? "ساخت فضای شخصی"
                : titleKind === "group"
                  ? "ساخت گروه"
                  : "شروع فضای کاری"
        }
        description={
          titleKind === "building"
            ? "واحدها، ساکنان، شارژ و قبوض — یا پروژهٔ پیمانکاری با مصالح و شرکا."
            : titleKind === "org"
              ? "تیم یا شرکای پروژه با بخش‌ها، تأیید و تدارکات."
              : offersExtendedKinds
                ? "گروه دوستانه بسازید، دوستان را دعوت کنید، خرج جمعی و خصوصی را جدا کنید — برای تیم‌ها خرج جاری شرکت هم هست."
                : "فضای شخصی یا گروه دوستانه بسازید، اعضا را دعوت کنید و خرج مشترک را تسویه کنید."
        }
        actions={
          <>
            <Link href={canonicalHref("home")}>{NAV_LABELS.spacesList}</Link>
            {created ? (
              <>
                <Link href={canonicalHref("space", created.slug)}>خانهٔ فضا</Link>
                <Link href={canonicalHref("members", created.slug)}>اعضا</Link>
                <Link href={createdFinanceHref}>{NAV_LABELS.addExpense}</Link>
              </>
            ) : null}
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

      {initialLoading ? (
        <EmptyHint loading>در حال بارگذاری…</EmptyHint>
      ) : (
        <ProductGrid>
          <SectionCard title="راهنمای شروع" delayClass="delay1">
            <ol className="onboardingSteps">
              {onboardingSteps.map((step, index) => (
                <li key={step}>
                  <span>{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </SectionCard>

          {allowDevAuth ? (
            <SectionCard title="هویت محلی (توسعه)" delayClass="delay1">
              <FormStack>
                <TextField
                  label="شناسه محلی"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                />
                <TextField
                  label="نام نمایشی"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
                <Button type="button" variant="ghost" onClick={refresh} disabled={pending}>
                  به‌روزرسانی هویت
                </Button>
              </FormStack>
              {me ? (
                <p className={`emptyHint ${styles.flatHint}`}>
                  کاربر: {me.actor.displayName} · {authModeLabel(me.actor.authMode)} · فضاها:{" "}
                  {me.workspaces.length}
                </p>
              ) : null}
            </SectionCard>
          ) : me ? (
            <SectionCard title="حساب شما" delayClass="delay1">
              <p className={`emptyHint ${styles.flatHint}`}>
                {me.actor.displayName} · {authModeLabel(me.actor.authMode)} · {me.workspaces.length}{" "}
                فضای کاری
              </p>
            </SectionCard>
          ) : null}

          <SectionCard title="ایجاد فضای کاری" delayClass="delay1">
            <GroupEmailVerificationNotice
              active={spaceKindForTemplate(template) === "group"}
            />
            {templatesLoading && !catalogReady ? (
              <p className={`emptyHint ${styles.flatHint}`}>در حال بارگذاری قالب‌ها…</p>
            ) : null}
            {!templatesLoading && !catalogReady ? (
              <EmptyHint>
                {templatesError
                  ? templatesError
                  : kindFilter
                    ? "برای این نوع فضا قالبی از سرور نیامد — می‌توانید فضای خالی بسازید."
                    : "کاتالوگ قالب خالی است — می‌توانید فضای خالی بسازید."}
                <div style={{ marginTop: 12 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void loadTemplatesCatalog();
                    }}
                    disabled={templatesLoading || pending}
                  >
                    تلاش دوباره
                  </Button>
                </div>
              </EmptyHint>
            ) : null}
            <form noValidate onSubmit={onCreate}>
              <FormStack>
                <TextField
                  id="create-group-name"
                  label={
                    selection === BLANK_SPACE_SELECTION
                      ? "نام فضا"
                      : template === "personal"
                        ? "نام فضای شخصی"
                        : groupTemplate
                          ? "نام گروه"
                          : "نام فضا"
                  }
                  value={name}
                  onChange={(event) => {
                    setNameError(null);
                    setName(event.target.value);
                  }}
                  placeholder={
                    selection === BLANK_SPACE_SELECTION
                      ? "مثلاً فضای کاری"
                      : template === "personal"
                        ? "مثلاً دفتر من"
                        : groupTemplate
                          ? "مثلاً سفر شمال"
                          : "مثلاً فضای کاری"
                  }
                  hint="شناسهٔ عمومی بعد از ساخت نشان داده می‌شود"
                  error={nameError ?? undefined}
                  required
                />
                <SelectField
                  label="قالب"
                  value={selection}
                  onChange={(event) =>
                    setSelection(event.target.value as TemplateSelection)
                  }
                >
                  <option value={BLANK_SPACE_SELECTION}>فضای خالی</option>
                  {visibleTemplates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.titleFa}
                    </option>
                  ))}
                </SelectField>
                {selection === BLANK_SPACE_SELECTION ? (
                  <p className={`emptyHint ${styles.flatHint}`}>
                    بدون قالب از کاتالوگ — فضای گروهی ساده ساخته می‌شود.
                  </p>
                ) : selectedTemplate?.summaryFa ? (
                  <p className={`emptyHint ${styles.flatHint}`}>
                    {selectedTemplate.summaryFa}
                  </p>
                ) : null}
                <Button type="submit" disabled={!submitEnabled}>
                  {pending
                    ? "در حال ساخت…"
                    : selection === BLANK_SPACE_SELECTION
                      ? "ایجاد فضای خالی"
                      : groupTemplate
                        ? "ساخت گروه"
                        : template === "personal"
                          ? "ساخت فضای شخصی"
                          : "ایجاد فضای کاری"}
                </Button>
              </FormStack>
            </form>
            {created ? (
              groupTemplate ||
              created.template === "friends_family" ||
              created.template === "household" ? (
                <GroupCreatedNext workspace={created} />
              ) : (
              <div className={`liveSuccess ${styles.created}`}>
                <p className={styles.createdLead}>
                  ساخته شد: {created.name}
                </p>
                <div className={styles.createdActions}>
                  <Button type="button" onClick={() => goToWorkspaceHome(created)}>
                    باز کردن خانهٔ فضا
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => goToWorkspaceMembers(created)}
                  >
                    دعوت اعضا
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => goToWorkspaceFinance(created)}
                  >
                    ثبت اولین خرج
                  </Button>
                  <Link href={canonicalHref("home")}>همه فضاها</Link>
                </div>
              </div>
              )
            ) : null}
          </SectionCard>

          <SectionCard title="فضاهای شما" badge={me?.workspaces.length ?? 0} delayClass="delay2">
            {!me?.workspaces.length ? (
              <EmptyHint>هنوز فضایی ندارید. فرم بالا را تکمیل کنید.</EmptyHint>
            ) : (
              <DataList>
                {me.workspaces.map((workspace) => (
                  <DataRow
                    key={workspace.id}
                    title={workspace.name}
                    trailing={
                      <StatusPill tone="neutral">
                        {workspaceTemplateLabel(workspace.template)}
                      </StatusPill>
                    }
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => goToWorkspaceHome(workspace)}
                      >
                        خانه
                      </Button>
                    }
                  />
                ))}
              </DataList>
            )}
          </SectionCard>
        </ProductGrid>
      )}
      </div>
    </AppShell>
  );
}
