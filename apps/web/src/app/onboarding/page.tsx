"use client";

import Link from "next/link";
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
import { useAppChrome } from "@/lib/use-app-chrome";

export default function OnboardingPage() {
  const chrome = useAppChrome();
  const [me, setMe] = useState<AuthMeResponse | null>(null);
  const [templates, setTemplates] = useState<WorkspaceTemplateCatalogItem[]>([]);
  const [name, setName] = useState("پروژه ویلا");
  const [slug, setSlug] = useState("villa-partners");
  const [template, setTemplate] = useState<WorkspaceTemplate>("project_partners");
  const [subject, setSubject] = useState<string>(DEV_IDENTITY_DEFAULTS.subject);
  const [displayName, setDisplayName] = useState<string>(DEV_IDENTITY_DEFAULTS.displayName);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<WorkspaceSummary | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const identity = getDevIdentity();
    setSubject(identity.subject);
    setDisplayName(identity.displayName);
    let cancelled = false;
    void (async () => {
      try {
        const [meResponse, templateResponse] = await Promise.all([
          api.me(),
          api.templates(),
        ]);
        if (cancelled) return;
        setMe(meResponse);
        setTemplates(templateResponse);
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "خطای ناشناخته");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function refresh() {
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(subject.trim() || "dev-local-user", displayName.trim() || "کاربر محلی");
          const meResponse = await api.me();
          setMe(meResponse);
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }

  function onCreate(event: FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void (async () => {
        try {
          setDevIdentity(subject.trim() || "dev-local-user", displayName.trim() || "کاربر محلی");
          const workspace = await api.createWorkspace({ name, slug, template });
          setCreated(workspace);
          setMe(await api.me());
          setError(null);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "خطای ناشناخته");
        }
      })();
    });
  }

  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || me?.actor.displayName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="مدیریت"
        title="شروع فضای کاری"
        description="تا زمان ورود سازمانی، هویت محلی با هدرهای توسعه ساخته می‌شود. فضای کاری را با قالب مناسب بسازید."
        actions={<Link href="/">خانه</Link>}
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}

      <ProductGrid>
        <SectionCard title="هویت محلی" delayClass="delay1">
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
              کاربر: {me.actor.displayName} · حالت: {me.actor.authMode} · فضاها: {me.workspaces.length}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="ایجاد فضای کاری" delayClass="delay1">
          <form onSubmit={onCreate}>
            <FormStack>
              <TextField
                label="نام فضا"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <TextField
                label="شناسه یکتا (slug)"
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
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
              <Button type="submit" disabled={pending}>
                ایجاد فضای کاری
              </Button>
            </FormStack>
          </form>
          {created ? (
            <p className="emptyHint" style={{ border: "none", padding: 0, color: "var(--success)" }}>
              ساخته شد: {created.name} ({created.slug})
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
                  trailing={<StatusPill tone="neutral">{workspace.template}</StatusPill>}
                />
              ))}
            </DataList>
          )}
        </SectionCard>
      </ProductGrid>
    </AppShell>
  );
}
