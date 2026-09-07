"use client";

import { newClientId } from "@/lib/id";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ExpenseSummary, MembershipSummary, WorkspaceSummary } from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
import { Amount, Button, TextField } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
import {
  SplitComposer,
  emptySplitComposer,
  type SplitComposerValue,
} from "@/components/split-composer";
import {
  DataList,
  DataRow,
  EmptyHint,
  FormStack,
  PageHeader,
  ProductGrid,
  SectionCard,
  StatusLine,
  StatusPill,
} from "@/components/ui-blocks";
import { PersonalFinanceOverviewPanel } from "@/components/personal-finance-overview-panel";
import { PersonalResourcesPanel } from "@/components/personal-resources-panel";
import { WorkspaceReportsPanel } from "@/components/workspace-reports-panel";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { tomanInputToIrrMinor } from "@/lib/irr-money";
import { expenseStatusLabel, spaceKindForTemplateLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";

const initialSplit: SplitComposerValue = emptySplitComposer("private");

/** Personal space home — additive; does not remove group/org flows. */
export function PersonalSpaceView() {
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [categoryId, setCategoryId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [title, setTitle] = useState("");
  const [toman, setToman] = useState("");
  const [split, setSplit] = useState<SplitComposerValue>(initialSplit);
  const [pending, startTransition] = useTransition();

  const personalWorkspaces = useMemo(
    () => chrome.workspaces.filter((w) => spaceKindForTemplate(w.template) === "personal"),
    [chrome.workspaces],
  );

  async function refresh(workspaceId: string) {
    const [memberList, expenseList, me, cats] = await Promise.all([
      api.listMembers(workspaceId),
      api.listExpenses(workspaceId),
      api.me(),
      api.listCategories(workspaceId).catch(() => []),
    ]);
    setMembers(memberList);
    setExpenses(expenseList.filter((e) => e.visibility === "private" || e.visibility === "shared"));
    setCategories(cats);
    setCurrentUserId(me.actor.userId);
    setSplit((prev) => ({
      ...prev,
      visibility: "private",
      participantUserIds: [me.actor.userId],
    }));
    const current = chrome.workspaces.find((w) => w.id === workspaceId) ?? null;
    setWorkspace(current);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    const preferred =
      personalWorkspaces.find((w) => w.id === chrome.workspaceId)?.id ??
      personalWorkspaces[0]?.id ??
      "";
    if (!preferred) {
      setWorkspace(null);
      setMembers([]);
      setExpenses([]);
      setLoading(false);
      return;
    }
    if (preferred !== chrome.workspaceId) {
      chrome.selectWorkspace(preferred);
    }
    setLoading(true);
    void refresh(preferred)
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "خطا")))
      .finally(() => setLoading(false));
  }, [chrome.ready, chrome.workspaceId, personalWorkspaces.length]);

  function onEnsurePersonal() {
    startTransition(() => {
      void (async () => {
        try {
          const created = await api.createWorkspace({
            name: "دفتر من",
            slug: `me-${Date.now().toString(36)}`.slice(0, 48),
            template: "personal",
          });
          chrome.selectWorkspace(created.id);
          chrome.refreshChrome();
          flashSuccess("فضای شخصی ساخته شد");
          await refresh(created.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ساخت فضای شخصی ناموفق"));
        }
      })();
    });
  }

  function onCreateExpense() {
    if (!workspace) return;
    const name = title.trim();
    const total = tomanInputToIrrMinor(toman);
    if (!name) {
      setError("عنوان لازم است");
      return;
    }
    if (!total) {
      setError("مبلغ نامعتبر است (فقط تومان / IRR)");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const me = await api.me();
          const created = await api.createExpenseDraft(workspace.id, {
            workspaceId: workspace.id,
            title: name,
            total,
            paidByUserId: me.actor.userId,
            splitMethod: "equal",
            participantUserIds: [me.actor.userId],
            splitLines: undefined,
            occurredOn: new Date().toISOString().slice(0, 10),
            visibility: "private",
            categoryId: categoryId || undefined,
            idempotencyKey: newClientId(),
          });
          await api.submitExpense(workspace.id, created.id);
          await api.postExpense(workspace.id, created.id);
          setTitle("");
          setToman("");
          flashSuccess("خرج شخصی ثبت و در دفتر اعمال شد");
          await refresh(workspace.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت خرج ناموفق"));
        }
      })();
    });
  }

  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="فضای شخصی"
        title="دفتر مالی من"
        description="خرج خصوصی همین‌جاست. گروه‌ها و سازمان‌ها از سوئیچر فضا."
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

      {loading ? (
        <EmptyHint>در حال بارگذاری دفتر شخصی…</EmptyHint>
      ) : (
        <ProductGrid>
          <SectionCard title="فضای من" delayClass="delay1">
            {workspace ? (
              <StatusLine>
                فعال: <b>{workspace.name}</b> · {spaceKindForTemplateLabel("personal")}
              </StatusLine>
            ) : (
              <FormStack>
                <EmptyHint>هنوز فضای شخصی ندارید.</EmptyHint>
                <Button type="button" onClick={onEnsurePersonal} disabled={pending}>
                  ساخت دفتر من
                </Button>
              </FormStack>
            )}
          </SectionCard>

          <SectionCard
            title="ثبت سریع خرج شخصی"
            delayClass="delay1"
            className="uxPrimaryPanel"
          >
            <div id="personal-expense">
            {!workspace ? (
              <EmptyHint>اول دفتر شخصی را بسازید.</EmptyHint>
            ) : (
              <FormStack>
                <TextField label="عنوان" value={title} onChange={(e) => setTitle(e.target.value)} />
                <TextField
                  label="مبلغ (تومان)"
                  value={toman}
                  onChange={(e) => setToman(e.target.value)}
                />
                {categories.length > 0 ? (
                  <label className="field">
                    <span>دسته</span>
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                      <option value="">بدون دسته</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <SplitComposer
                  members={members}
                  totalToman={toman}
                  value={split}
                  onChange={setSplit}
                  personalOnly
                  currentUserId={currentUserId}
                />
                <Button type="button" onClick={onCreateExpense} disabled={pending}>
                  ثبت خرج خصوصی
                </Button>
              </FormStack>
            )}
            </div>
          </SectionCard>

          <PersonalFinanceOverviewPanel />
          <PersonalResourcesPanel />

          <SectionCard title="خرج‌های من" badge={expenses.length} delayClass="delay2">
            {expenses.length === 0 ? (
              <EmptyHint>هنوز خرجی نیست.</EmptyHint>
            ) : (
              <DataList>
                {expenses.slice(0, 20).map((expense) => (
                  <DataRow
                    key={expense.id}
                    title={expense.title}
                    meta={
                      <StatusPill tone={expense.status === "posted" ? "ok" : "warn"}>
                        {expenseStatusLabel(expense.status)}
                      </StatusPill>
                    }
                    trailing={<Amount irrMinor={expense.total.amountMinor} />}
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          {workspace ? (
            <WorkspaceReportsPanel
              workspaceId={workspace.id}
              defaultVisibility="private"
              onChanged={() => void refresh(workspace.id)}
            />
          ) : null}
        </ProductGrid>
      )}
    </AppShell>
  );
}
