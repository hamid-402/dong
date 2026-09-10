"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipSummary } from "@dang/contracts";
import { isFinanceManagerRole, isReadOnlyRole, spaceKindForTemplate } from "@dang/contracts";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  ProductGrid,
  StatusLine,
} from "@/components/ui-blocks";
import { OperationsModuleHeader } from "@/components/views/finance/finance-operations-header";
import { AllowancesPanel } from "@/components/allowances-panel";
import { CostCentersPanel } from "@/components/cost-centers-panel";
import { FxRatesPanel } from "@/components/fx-rates-panel";
import { WaveFFinancePanel } from "@/components/wave-f-finance-panel";
import { WorkspacePlanPanel } from "@/components/workspace-plan-panel";
import { api } from "@/lib/api";
import { friendlyErrorMessage } from "@/lib/api-errors";
import { NAV_LABELS } from "@/lib/nav-labels";
import { FlashMessages, useFlashMessage } from "@/lib/use-flash-message";
import { useAppChrome } from "@/lib/use-app-chrome";
import { membershipRoleLabel } from "@/lib/status-labels";
import { wPath } from "@/lib/workspace-paths";

type OrgFinanceSnapshot = {
  activeCostCenters: number | null;
  allowanceAlerts: number | null;
  openReimbursements: number | null;
  budgetAlerts: number | null;
};

/**
 * Discoverable home for org Wave-F tools (cost centers, reimbursement, budgets, policy, plan).
 * Mounted from More / palette — not buried only on space home scroll.
 */
export function OrgFinanceView() {
  const chrome = useAppChrome();
  const { error, setError, flashSuccess, successMessage } = useFlashMessage();
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [myRole, setMyRole] = useState("");
  const [snapshot, setSnapshot] = useState<OrgFinanceSnapshot>({
    activeCostCenters: null,
    allowanceAlerts: null,
    openReimbursements: null,
    budgetAlerts: null,
  });
  const [pending, startTransition] = useTransition();
  const flags = chrome.capabilities?.productFlags;
  const workspace = chrome.workspaces.find((w) => w.id === chrome.workspaceId);
  const isOrg =
    workspace != null && spaceKindForTemplate(workspace.template) === "org";
  const readOnly = isReadOnlyRole(myRole);
  const showAny =
    Boolean(flags?.costCenter) ||
    Boolean(flags?.allowance) ||
    Boolean(flags?.reimbursement) ||
    Boolean(flags?.categoryBudget) ||
    Boolean(flags?.expenseImport) ||
    Boolean(flags?.expensePolicy) ||
    Boolean(flags?.workspacePlans) ||
    Boolean(flags?.planAdmin) ||
    Boolean(flags?.fxRates);

  function refresh() {
    if (!chrome.workspaceId || !isOrg) {
      setMembers([]);
      setMyRole("");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const workspaceId = chrome.workspaceId;
          const [list, costCenters, allowances, reimbursements, budgets] = await Promise.all([
            api.listMembers(workspaceId),
            flags?.costCenter ? api.listCostCenters(workspaceId).catch(() => null) : null,
            flags?.allowance ? api.getAllowanceUsage(workspaceId).catch(() => null) : null,
            flags?.reimbursement ? api.listReimbursements(workspaceId).catch(() => null) : null,
            flags?.categoryBudget ? api.listCategoryBudgetUsage(workspaceId).catch(() => null) : null,
          ]);
          setMembers(list);
          const uid = chrome.actor?.userId;
          setMyRole(list.find((m) => m.userId === uid)?.role ?? "");
          setSnapshot({
            activeCostCenters: costCenters?.filter((item) => item.active).length ?? null,
            allowanceAlerts: allowances?.filter((item) => item.alertReached).length ?? null,
            openReimbursements:
              reimbursements?.filter((item) =>
                item.status === "draft" ||
                item.status === "submitted" ||
                item.status === "approved",
              ).length ?? null,
            budgetAlerts: budgets?.filter((item) => item.alertReached).length ?? null,
          });
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بارگذاری اعضا ناموفق"));
        }
      })();
    });
  }

  useEffect(() => {
    refresh();
  }, [chrome.workspaceId, chrome.actor?.userId, isOrg, setError]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      {workspace ? (
        <OperationsModuleHeader
          ariaLabel="مرکز مالی سازمانی"
          destinations={[
            { key: "org-finance", label: NAV_LABELS.orgFinance, href: wPath(workspace.slug, "orgFinance"), active: true },
            { key: "expenses", label: NAV_LABELS.expenses, href: wPath(workspace.slug, "expenses"), active: false },
            { key: "approvals", label: NAV_LABELS.approvals, href: wPath(workspace.slug, "approvals"), active: false },
            { key: "ledger", label: NAV_LABELS.ledger, href: wPath(workspace.slug, "ledger"), active: false },
            { key: "audit", label: "تاریخچه", href: wPath(workspace.slug, "audit"), active: false },
          ]}
          metrics={[
            {
              label: "مرکز هزینه فعال",
              value: snapshot.activeCostCenters == null ? "—" : new Intl.NumberFormat("fa-IR").format(snapshot.activeCostCenters),
              detail: !flags?.costCenter ? "قابلیت خاموش" : snapshot.activeCostCenters == null ? "داده API در دسترس نیست" : "از API مرکز هزینه",
            },
            {
              label: "هشدار سقف عضو",
              value: snapshot.allowanceAlerts == null ? "—" : new Intl.NumberFormat("fa-IR").format(snapshot.allowanceAlerts),
              detail: !flags?.allowance ? "قابلیت خاموش" : snapshot.allowanceAlerts == null ? "داده API در دسترس نیست" : "عبور واقعی از آستانه",
              tone: snapshot.allowanceAlerts ? "attention" : "neutral",
            },
            {
              label: "بازپرداخت باز",
              value: snapshot.openReimbursements == null ? "—" : new Intl.NumberFormat("fa-IR").format(snapshot.openReimbursements),
              detail: !flags?.reimbursement ? "قابلیت خاموش" : snapshot.openReimbursements == null ? "داده API در دسترس نیست" : "پیش‌نویس تا تأییدشده",
            },
            {
              label: "هشدار بودجه",
              value: snapshot.budgetAlerts == null ? "—" : new Intl.NumberFormat("fa-IR").format(snapshot.budgetAlerts),
              detail: !flags?.categoryBudget ? "قابلیت خاموش" : snapshot.budgetAlerts == null ? "داده API در دسترس نیست" : "از مصرف دسته‌ها",
              tone: snapshot.budgetAlerts ? "attention" : "neutral",
            },
          ]}
          roleLabel={myRole ? membershipRoleLabel(myRole) : null}
          persistenceLabel={chrome.persistenceLabel}
          pending={pending || !chrome.ready}
          onRefresh={refresh}
        />
      ) : null}
      <FlashMessages error={error} successMessage={successMessage} />

      {!chrome.workspaceId ? (
        <EmptyHint>فضای کاری را انتخاب کنید.</EmptyHint>
      ) : !isOrg ? (
        <EmptyHint>این صفحه برای فضاهای سازمانی است. برای گروه، از خانهٔ گروه استفاده کنید.</EmptyHint>
      ) : !showAny ? (
        <EmptyHint>
          ابزارهای مالی سازمان در این محیط پشت پرچم محصول خاموش‌اند — کاشی More فقط وقتی
          capabilities آن‌ها را تأیید کند نشان داده می‌شود.
        </EmptyHint>
      ) : (
        <ProductGrid>
          <StatusLine>
            اگر بخشی را نمی‌بینید، پرچم مربوط در capabilities خاموش است (نه باگ UI).
          </StatusLine>
          {flags?.costCenter && chrome.workspaceId ? (
            <CostCentersPanel workspaceId={chrome.workspaceId} readOnly={readOnly} />
          ) : null}
          {flags?.allowance &&
          chrome.workspaceId &&
          isFinanceManagerRole(myRole) ? (
            <AllowancesPanel
              workspaceId={chrome.workspaceId}
              members={members}
              onError={setError}
              onSuccess={flashSuccess}
            />
          ) : null}
          {flags &&
          (flags.reimbursement ||
            flags.categoryBudget ||
            flags.expenseImport ||
            flags.expensePolicy) &&
          chrome.workspaceId ? (
            <WaveFFinancePanel
              workspaceId={chrome.workspaceId}
              flags={flags}
              readOnly={readOnly}
              onError={setError}
              onChanged={() => undefined}
            />
          ) : null}
          {flags &&
          (flags.workspacePlans || flags.planAdmin) &&
          chrome.workspaceId ? (
            <WorkspacePlanPanel
              workspaceId={chrome.workspaceId}
              flags={flags}
              myRole={myRole}
              onError={setError}
            />
          ) : null}
          {flags?.fxRates ? (
            <FxRatesPanel
              canWrite
              conversionLive={Boolean(chrome.capabilities?.conversionLive)}
              readOnly={readOnly}
              onError={setError}
            />
          ) : null}
        </ProductGrid>
      )}
    </AppShell>
  );
}
