"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type {
  BudgetSummary,
  ExpenseSummary,
  MembershipSummary,
  WorkspaceSummary,
} from "@dang/contracts";
import { isReadOnlyRole, spaceKindForTemplate } from "@dang/contracts";
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
import { NAV_LABELS } from "@/lib/nav-labels";
import {
  expenseStatusLabel,
  expenseVisibilityLabel,
  membershipRoleLabel,
  workspaceTemplateLabel,
} from "@/lib/status-labels";
import { useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { useOptionalWorkspaceScope } from "@/components/shell/workspace-scope";
import { templateSupportsCompanyExpenses } from "@/lib/workspace-modules";
import { wPath } from "@/lib/workspace-paths";

const APPROVER_ROLES = new Set(["owner", "admin", "approver", "finance"]);

function budgetStatusLabel(status: string): string {
  if (status === "open" || status === "active") return "باز";
  if (status === "closed") return "بسته";
  if (status === "draft") return "پیش‌نویس";
  return status;
}

/** Org / team home — status + next step. Wave F tools live on /org-finance. */
export function OrgSpaceView() {
  const chrome = useAppChrome();
  const scope = useOptionalWorkspaceScope();
  const { successMessage, error, setError, flashSuccess } = useFlashMessage();
  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseSummary[]>([]);
  const [budgets, setBudgets] = useState<BudgetSummary[]>([]);
  const [approvalCount, setApprovalCount] = useState(0);
  const [myRole, setMyRole] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const flags = chrome.capabilities?.productFlags;
  const orgFinanceLive = Boolean(
    flags?.costCenter ||
      flags?.allowance ||
      flags?.reimbursement ||
      flags?.categoryBudget ||
      flags?.expenseImport ||
      flags?.expensePolicy ||
      flags?.workspacePlans ||
      flags?.planAdmin,
  );

  async function refresh(workspaceId: string) {
    const actorId = chrome.actor?.userId;
    const [memberList, expenseList, budgetList, me, queue] = await Promise.all([
      api.listMembers(workspaceId),
      api.listExpenses(workspaceId),
      api.listBudgets(workspaceId),
      actorId ? Promise.resolve(null) : api.me(),
      flags?.approvalQueue
        ? api.listApprovalQueue(workspaceId).catch(() => [])
        : Promise.resolve([]),
    ]);
    const userId = actorId ?? me!.actor.userId;
    setMembers(memberList);
    setExpenses(expenseList);
    setBudgets(budgetList);
    setApprovalCount(queue.length);
    const role = memberList.find((m) => m.userId === userId)?.role ?? "";
    setMyRole(role);
    setWorkspace(chrome.workspaces.find((w) => w.id === workspaceId) ?? null);
  }

  useEffect(() => {
    if (!chrome.ready) return;
    const scoped = scope?.workspaceId
      ? chrome.workspaces.find((w) => w.id === scope.workspaceId) ?? null
      : chrome.workspaces.find((w) => w.id === chrome.workspaceId) ?? null;
    const isOrg = scoped && spaceKindForTemplate(scoped.template) === "org";
    if (!isOrg || !scoped) {
      setWorkspace(null);
      setMembers([]);
      setExpenses([]);
      setBudgets([]);
      setApprovalCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refresh(scoped.id)
      .then(() => setError(null))
      .catch((err: unknown) => setError(friendlyErrorMessage(err, "خطا")))
      .finally(() => setLoading(false));
  }, [
    chrome.ready,
    chrome.workspaceId,
    chrome.workspaces,
    scope?.workspaceId,
    chrome.actor?.userId,
    flags?.approvalQueue,
  ]);

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
          flashSuccess("خرج شرکتی در دفتر ثبت شد");
          await refresh(workspace.id);
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "ثبت نهایی ناموفق"));
        }
      })();
    });
  }

  const canApprove = APPROVER_ROLES.has(myRole);
  const readOnly = isReadOnlyRole(myRole);
  const privateClaims = expenses.filter((e) => e.visibility === "private");
  const companyExpenses = expenses.filter((e) => e.visibility === "company");
  const pageError = error ?? chrome.error;
  const slug = workspace?.slug ?? null;
  const orgFinanceHref = slug ? wPath(slug, "orgFinance") : hubPathFor("/orgs");
  const approvalsHref = slug ? wPath(slug, "approvals") : hubPathFor("/workspaces");
  const membersHref = slug ? wPath(slug, "members") : hubPathFor("/workspaces/invite");
  const procurementHref = slug
    ? wPath(slug, "procurement")
    : hubPathFor("/workspaces/procurement");

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
        description="وضعیت بودجه و مطالبات — ابزارهای Wave F در مالی سازمان."
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
              <b>{workspace.name}</b> · {workspaceTemplateLabel(workspace.template)} · نقش شما:{" "}
              {membershipRoleLabel(myRole)}
              {readOnly ? " · فقط مشاهده" : null}
            </StatusLine>
            {!templateSupportsCompanyExpenses(workspace.template) ? (
              <EmptyHint>این قالب خرج شرکتی ندارد.</EmptyHint>
            ) : null}
            <div className="dataRowActions">
              {orgFinanceLive ? (
                <Link href={orgFinanceHref}>
                  <Button type="button">{NAV_LABELS.orgFinance}</Button>
                </Link>
              ) : null}
              <Link href={procurementHref}>
                <Button type="button" variant="ghost">
                  {NAV_LABELS.procurement}
                </Button>
              </Link>
              <Link href={membersHref}>
                <Button type="button" variant="ghost">
                  {NAV_LABELS.invite}
                </Button>
              </Link>
            </div>
          </SectionCard>

          {flags?.approvalQueue ? (
            <SectionCard
              title={NAV_LABELS.approvals}
              badge={approvalCount}
              delayClass="delay1"
            >
              <StatusLine>
                {approvalCount === 0
                  ? "موردی در صف تأیید نیست."
                  : `${approvalCount} مورد از API در انتظار اقدام.`}
              </StatusLine>
              <Link href={approvalsHref}>
                <Button type="button" variant="ghost">
                  رفتن به مرکز تأیید
                </Button>
              </Link>
            </SectionCard>
          ) : null}

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
                        متعهد <Amount irrMinor={b.committedMinor} /> ·{" "}
                        {budgetStatusLabel(b.status)}
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
            <Link href={procurementHref}>رفتن به تدارکات</Link>
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
                      !readOnly && canApprove ? (
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
                      !readOnly &&
                      (expense.status === "draft" || expense.status === "submitted") ? (
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
                <DataRow
                  key={m.userId}
                  title={m.displayName}
                  meta={membershipRoleLabel(m.role)}
                />
              ))}
            </DataList>
          </SectionCard>

          <WorkspaceReportsPanel
            workspaceId={workspace.id}
            defaultVisibility="company"
            readOnly={readOnly}
            onChanged={() => void refresh(workspace.id)}
          />
        </ProductGrid>
      )}
    </AppShell>
  );
}
