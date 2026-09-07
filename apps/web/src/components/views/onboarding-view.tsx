"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import type {
  AuthMeResponse,
  WorkspaceSummary,
  WorkspaceTemplate,
  WorkspaceTemplateCatalogItem,
} from "@dang/contracts";
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
import { wPath } from "@/lib/workspace-paths";

const ONBOARDING_STEPS = [
  "نام و قالب فضا را انتخاب کنید (شخصی / گروه / سازمان)",
  "فضا ساخته می‌شود و به‌عنوان زمینهٔ فعال تنظیم می‌گردد",
  "از خانه: یک کار بعدی (ثبت خرج) — بقیه ابزارها در تب «بیشتر» یا تب فضا",
] as const;

export function OnboardingView() {
  const router = useRouter();
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [templates, setTemplates] = useState<WorkspaceTemplateCatalogItem[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [template, setTemplate] = useState<WorkspaceTemplate>("friends_family");
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

  function goToWorkspaceFinance(workspace: WorkspaceSummary) {
    chrome.selectWorkspace(workspace.id);
    chrome.refreshChrome();
    router.push(wPath(workspace.slug, "expenses"));
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
  const createdFinanceHref = created
    ? wPath(created.slug, "expenses")
    : hubPathFor("/workspaces");

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || me?.actor.displayName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="مدیریت"
        title="شروع فضای کاری"
        description="گروه دوستانه بسازید، دوستان را دعوت کنید، خرج جمعی و خصوصی را جدا کنید — برای تیم‌ها خرج جاری شرکت هم هست."
        actions={
          <>
            <Link href="/">خانه</Link>
            {created ? <Link href={createdFinanceHref}>رفتن به مالی</Link> : null}
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
                  {(templates.length
                    ? templates
                    : [
                        {
                          id: "project_partners" as const,
                          titleFa: "شرکای پروژه",
                          summaryFa: "",
                          defaultModules: [],
                        },
                      ]
                  ).map((item) => (
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
              <p className="liveSuccess" style={{ marginTop: 12 }}>
                ساخته شد: {created.name} ({created.slug}) —{" "}
                <button
                  type="button"
                  className="textButton"
                  onClick={() => goToWorkspaceFinance(created)}
                >
                  ادامه در مالی
                </button>
              </p>
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
                        onClick={() => goToWorkspaceFinance(workspace)}
                      >
                        انتخاب
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
