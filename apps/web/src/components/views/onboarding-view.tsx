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
import { AppShell } from "@/components/app-shell";
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
import { hubPathFor } from "@/lib/hub-links";
import { NAV_LABELS } from "@/lib/nav-labels";
import { wPath } from "@/lib/workspace-paths";

const ONBOARDING_STEPS = [
  "نام و قالب فضا را انتخاب کنید (شخصی / گروه / ساختمان / سازمان)",
  "فضا ساخته می‌شود و خانهٔ آن با کارت‌های مالی، خرید و فضاها باز می‌شود",
  "از خانه اعضا را دعوت کنید یا با ＋ اولین خرج را ثبت کنید — فهرست همهٔ فضاها در /spaces",
] as const;

export function OnboardingView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [templates, setTemplates] = useState<WorkspaceTemplateCatalogItem[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const kindHint = searchParams.get("kind");
  const templateHint = searchParams.get("template");
  const defaultTemplate: WorkspaceTemplate =
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
            : "friends_family";
  const [template, setTemplate] = useState<WorkspaceTemplate>(defaultTemplate);
  const [subject, setSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [displayName, setDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [initialLoading, setInitialLoading] = useState(true);
  const [allowDevAuth, setAllowDevAuth] = useState(false);
  const [created, setCreated] = useState<WorkspaceSummary | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const identity = getDevIdentity();
    setSubject(identity.subject);
    setDisplayName(identity.displayName);
    let cancelled = false;
    void (async () => {
      try {
        const templateResponse = await api.templates();
        if (cancelled) return;
        setTemplates(templateResponse);
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
    router.push(wPath(workspace.slug, "space"));
  }

  function goToWorkspaceFinance(workspace: WorkspaceSummary) {
    chrome.selectWorkspace(workspace.id);
    chrome.refreshChrome();
    router.push(`${wPath(workspace.slug, "expenses")}#quick-expense`);
  }

  function goToWorkspaceMembers(workspace: WorkspaceSummary) {
    chrome.selectWorkspace(workspace.id);
    chrome.refreshChrome();
    router.push(wPath(workspace.slug, "members"));
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName) {
      setError("نام فضای کاری را وارد کنید");
      return;
    }
    if (!/^[a-z0-9-]{2,48}$/.test(trimmedSlug)) {
      setError("شناسه یکتا فقط حروف کوچک انگلیسی، عدد و خط تیره (۲–۴۸ کاراکتر)");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(subject.trim() || "dev-local-user", displayName.trim() || "کاربر محلی");
          const workspace = await api.createWorkspace({
            name: trimmedName,
            slug: trimmedSlug,
            template,
          });
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
  const selectedTemplate = templates.find((item) => item.id === template);
  const kindFilter =
    kindHint === "personal" ||
    kindHint === "group" ||
    kindHint === "building" ||
    kindHint === "org"
      ? kindHint
      : null;
  const visibleTemplates = useMemo(() => {
    const base =
      templates.length > 0
        ? templates
        : [
            {
              id: "friends_family" as const,
              titleFa: "گروه دوستانه",
              summaryFa: "",
              defaultModules: [] as string[],
              spaceKind: "group" as const,
            },
          ];
    return base.filter(
      (item) => !kindFilter || spaceKindForTemplate(item.id) === kindFilter,
    );
  }, [templates, kindFilter]);
  const createdFinanceHref = created
    ? `${wPath(created.slug, "expenses")}#quick-expense`
    : hubPathFor("/workspaces");

  useEffect(() => {
    if (visibleTemplates.length === 0) return;
    if (!visibleTemplates.some((t) => t.id === template)) {
      setTemplate(visibleTemplates[0]!.id);
    }
  }, [visibleTemplates, template]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || me?.actor.displayName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="مدیریت"
        title={
          kindFilter === "building"
            ? "ساخت فضای ساختمان"
            : kindFilter === "org"
              ? "ساخت فضای سازمانی"
              : kindFilter === "personal"
                ? "ساخت فضای شخصی"
                : kindFilter === "group"
                  ? "ساخت گروه"
                  : "شروع فضای کاری"
        }
        description={
          kindFilter === "building"
            ? "واحدها، ساکنان، شارژ و قبوض — یا پروژهٔ پیمانکاری با مصالح و شرکا."
            : kindFilter === "org"
              ? "تیم یا شرکای پروژه با بخش‌ها، تأیید و تدارکات."
              : "گروه دوستانه بسازید، دوستان را دعوت کنید، خرج جمعی و خصوصی را جدا کنید — برای تیم‌ها خرج جاری شرکت هم هست."
        }
        actions={
          <>
            <Link href="/spaces">{NAV_LABELS.spacesList}</Link>
            {created ? (
              <>
                <Link href={wPath(created.slug, "space")}>خانهٔ فضا</Link>
                <Link href={wPath(created.slug, "members")}>اعضا</Link>
                <Link href={createdFinanceHref}>ثبت خرج</Link>
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
              {ONBOARDING_STEPS.map((step, index) => (
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
                <p className="emptyHint" style={{ border: "none", padding: 0 }}>
                  کاربر: {me.actor.displayName} · {authModeLabel(me.actor.authMode)} · فضاها:{" "}
                  {me.workspaces.length}
                </p>
              ) : null}
            </SectionCard>
          ) : me ? (
            <SectionCard title="حساب شما" delayClass="delay1">
              <p className="emptyHint" style={{ border: "none", padding: 0 }}>
                {me.actor.displayName} · {authModeLabel(me.actor.authMode)} · {me.workspaces.length}{" "}
                فضای کاری
              </p>
            </SectionCard>
          ) : null}

          <SectionCard title="ایجاد فضای کاری" delayClass="delay1">
            <form onSubmit={onCreate}>
              <FormStack>
                <TextField
                  label="نام فضا"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="مثلاً گروه دوستان"
                  required
                />
                <TextField
                  label="شناسه یکتا (slug)"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="friends-group"
                  hint="فقط a-z، 0-9 و خط تیره"
                  required
                />
                <SelectField
                  label="قالب"
                  value={template}
                  onChange={(event) => setTemplate(event.target.value as WorkspaceTemplate)}
                >
                  {visibleTemplates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.titleFa}
                    </option>
                  ))}
                </SelectField>
                {selectedTemplate?.summaryFa ? (
                  <p className="emptyHint" style={{ border: "none", padding: 0 }}>
                    {selectedTemplate.summaryFa}
                  </p>
                ) : null}
                <Button type="submit" disabled={pending}>
                  {pending ? "در حال ساخت…" : "ایجاد فضای کاری"}
                </Button>
              </FormStack>
            </form>
            {created ? (
              <div className="liveSuccess" style={{ marginTop: 12 }}>
                <p style={{ margin: "0 0 8px" }}>
                  ساخته شد: {created.name} ({created.slug})
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
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
                  <Link href="/spaces">همه فضاها</Link>
                </div>
              </div>
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
                    meta={workspace.slug}
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
    </AppShell>
  );
}
