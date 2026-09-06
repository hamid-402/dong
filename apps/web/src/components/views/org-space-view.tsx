"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import type {
  BudgetSummary,
  ExpenseSummary,
  MembershipSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import { spaceKindForTemplate } from "@dang/contracts";
import { Amount, Button } from "@dang/ui";
import { AppShell } from "@/components/app-shell";
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
import { WorkspaceReportsPanel } from "@/components/workspace-reports-panel";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { hubPathFor } from "@/lib/hub-links";
import { expenseStatusLabel, expenseVisibilityLabel } from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";

const APPROVER_ROLES = new Set(["owner", "admin", "approver", "finance"]);

/** Org / team home — budgets, company reimbursement, procurement links. Additive. */
export function OrgSpaceView() {
  const chrome = useAppChrome();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [myRole, setMyRole] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const orgWorkspaces = useMemo(
    () => chrome.workspaces.filter((w) => spaceKindForTemplate(w.template) === "org"),
    [chrome.workspaces],
  );

  async function refresh(workspaceId: string) {
    const [memberList, expenseList, budgetList, me] = await Promise.all([
      api.listMembers(workspaceId),
      api.listExpenses(workspaceId),
      api.listBudgets(workspaceId),
      api.me(),
    ]);
    setMembers(memberList);
    setExpenses(expenseList);
    setBudgets(budgetList);
    const role = memberList.find((m) => m.userId === me.actor.userId)?.role ?? "";
    setMyRole(role);
    setWorkspace(chrome.workspaces.find((w) => w.id === workspaceId) ?? null);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    const preferred =
      orgWorkspaces.find((w) => w.id === chrome.workspaceId)?.id ??
      orgWorkspaces[0]?.id ??
      "";
    if (!preferred) {
      setWorkspace(null);
      setMembers([]);
      setExpenses([]);
      setBudgets([]);
      setLoading(false);
      return;
    }
    if (preferred !== chrome.workspaceId) chrome.selectWorkspace(preferred);
    setLoading(true);
    void refresh(preferred)
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "خطا")))
      .finally(() => setLoading(false));
  }, [chrome.ready, chrome.workspaceId, orgWorkspaces.length]);

  function onPromote(expenseId: string) {
    if (!workspace) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.promoteExpenseCompany(workspace.id, expenseId);
          flashSuccess("خرج خصوصی به شرکتی تبدیل شد");
          await refresh(workspace.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "تأیید مطالبه ناموفق"));
        }
      })();
    });
  }

  function onPost(expenseId: string) {
    if (!workspace) return;
    startTransition(() => {
      void (async () => {
        try {
          await api.postExpense(workspace.id, expenseId);
          flashSuccess("خرج در دفترکل ثبت و بودجه به‌روز شد");
          await refresh(workspace.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت نهایی ناموفق"));
        }
      })();
    });
  }

  const canApprove = APPROVER_ROLES.has(myRole);
  const privateClaims = expenses.filter((e) => e.visibility === "private");
  const companyExpenses = expenses.filter((e) => e.visibility === "company");
  const pageError = error ?? chrome.error;

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow="سازمان"
        title="فضای سازمانی"
        description="کار بعدی: ثبت یا تأیید خرج شرکتی. خرید، دفتر و تسویه در میانبرها."
        actions={
          <>
            <Link href={hubPathFor("/workspaces")}>خرج و تسویه</Link>
            <span className="uxSecondaryActions">
              <Link href={hubPathFor("/workspaces/procurement")}>تدارکات</Link>
              <Link href={hubPathFor("/daily-ledger")}>دفتر روزانه</Link>
            </span>
          </>
        }
      />
      {pageError ? <p className="liveError">{pageError}</p> : null}
      {successMessage ? <p className="liveSuccess">{successMessage}</p> : null}

      {loading ? (
        <EmptyHint>در حال بارگذاری…</EmptyHint>
      ) : !workspace ? (
        <ProductGrid>
          <SectionCard title="سازمانی ندارید" delayClass="delay1">
            <EmptyHint>
              هنوز فضای تیمی/شرکتی ندارید. از «ساخت فضا» قالب تیم یا ساختمان را بسازید.
            </EmptyHint>
            <FormStack>
              <Link href={hubPathFor("/onboarding")}>
                <Button type="button">ساخت فضای سازمانی</Button>
              </Link>
            </FormStack>
          </SectionCard>
        </ProductGrid>
      ) : (
        <ProductGrid>
          <SectionCard title="فضای فعال" delayClass="delay1">
            <StatusLine>
              <b>{workspace.name}</b> · {workspace.template} · نقش شما: {myRole || "—"}
            </StatusLine>
            {!templateSupportsCompanyExpenses(workspace.template) ? (
              <EmptyHint>این قالب خرج شرکتی ندارد.</EmptyHint>
            ) : null}
          </SectionCard>

          <SectionCard title="بودجه‌ها" badge={budgets.length} delayClass="delay1">
            {budgets.length === 0 ? (
              <EmptyHint>
                بودجه‌ای نیست — از تدارکات بسازید. با ثبت خرج شرکتی، spent از API کم می‌شود.
              </EmptyHint>
            ) : (
              <DataList>
                {budgets.map((b) => (
                  <DataRow
                    key={b.id}
                    title={b.name}
                    meta={
                      <>
                        متعهد <Amount irrMinor={b.committedMinor} /> · {b.status}
                      </>
                    }
                    trailing={
                      <span>
                        <Amount irrMinor={b.spentMinor} /> /{" "}
                        <Amount irrMinor={b.ceiling.amountMinor} />
                      </span>
                    }
                  />
                ))}
              </DataList>
            )}
            <Link href={hubPathFor("/workspaces/procurement")}>مدیریت بودجه و خرید</Link>
          </SectionCard>

          <SectionCard
            title="مطالبات خصوصی (در انتظار تأیید شرکتی)"
            badge={privateClaims.length}
            delayClass="delay2"
          >
            {privateClaims.length === 0 ? (
              <EmptyHint>مطالبه خصوصی‌ای نیست.</EmptyHint>
            ) : (
              <DataList>
                {privateClaims.map((expense) => (
                  <DataRow
                    key={expense.id}
                    title={expense.title}
                    meta={
                      <>
                        <StatusPill tone="warn">{expenseStatusLabel(expense.status)}</StatusPill>
                        <StatusPill tone="warn">
                          {expenseVisibilityLabel(expense.visibility)}
                        </StatusPill>
                      </>
                    }
                    trailing={<Amount irrMinor={expense.total.amountMinor} />}
                    actions={
                      canApprove ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => onPromote(expense.id)}
                        >
                          تأیید شرکتی
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="خرج‌های شرکتی" badge={companyExpenses.length} delayClass="delay2">
            {companyExpenses.length === 0 ? (
              <EmptyHint>خرج شرکتی ثبت نشده.</EmptyHint>
            ) : (
              <DataList>
                {companyExpenses.slice(0, 20).map((expense) => (
                  <DataRow
                    key={expense.id}
                    title={expense.title}
                    meta={
                      <StatusPill tone={expense.status === "posted" ? "ok" : "warn"}>
                        {expenseStatusLabel(expense.status)}
                      </StatusPill>
                    }
                    trailing={<Amount irrMinor={expense.total.amountMinor} />}
                    actions={
                      expense.status === "draft" || expense.status === "submitted" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => onPost(expense.id)}
                        >
                          ثبت نهایی
                        </Button>
                      ) : null
                    }
                  />
                ))}
              </DataList>
            )}
          </SectionCard>

          <SectionCard title="اعضا" badge={members.length} delayClass="delay3">
            <DataList>
              {members.map((m) => (
                <DataRow key={m.userId} title={m.displayName} meta={m.role} />
              ))}
            </DataList>
          </SectionCard>

          <WorkspaceReportsPanel
            workspaceId={workspace.id}
            defaultVisibility="company"
            onChanged={() => void refresh(workspace.id)}
          />
        </ProductGrid>
      )}
    </AppShell>
  );
}
