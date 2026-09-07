"use client";

import { useEffect, useState, useTransition } from "react";
import type { MembershipSummary } from "@dang/contracts";
import { isFinanceManagerRole, isReadOnlyRole, spaceKindForTemplate } from "@dang/contracts";
import { AppShell } from "@/components/app-shell";
import {
  EmptyHint,
  PageHeader,
  ProductGrid,
  StatusLine,
} from "@/components/ui-blocks";
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

/**
 * Discoverable home for org Wave-F tools (cost centers, reimbursement, budgets, policy, plan).
 * Mounted from More / palette — not buried only on space home scroll.
 */
export function OrgFinanceView() {
  const chrome = useAppChrome();
  const { error, setError, flashSuccess, successMessage } = useFlashMessage();
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [myRole, setMyRole] = useState("");
  const [, startTransition] = useTransition();
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

  useEffect(() => {
    if (!chrome.workspaceId || !isOrg) {
      setMembers([]);
      setMyRole("");
      return;
    }
    startTransition(() => {
      void (async () => {
        try {
          const list = await api.listMembers(chrome.workspaceId);
          setMembers(list);
          const uid = chrome.actor?.userId;
          setMyRole(list.find((m) => m.userId === uid)?.role ?? "");
        } catch (err: unknown) {
          setError(friendlyErrorMessage(err, "بارگذاری اعضا ناموفق"));
        }
      })();
    });
  }, [chrome.workspaceId, chrome.actor?.userId, isOrg, setError]);

  return (
    <AppShell
      workspaceId={chrome.workspaceId}
      workspaceName={chrome.workspaceName || undefined}
      userName={chrome.userName || undefined}
      persistenceLabel={chrome.persistenceLabel}
    >
      <PageHeader
        eyebrow={NAV_LABELS.sectionFinance}
        title={NAV_LABELS.orgFinance}
        description="مرکز هزینه، بازپرداخت، بودجه دسته، سیاست خرج و پلن — فقط وقتی در capabilities فعال باشد."
      />
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
              conversionLive={chrome.capabilities?.conversionLive === true}
              readOnly={readOnly}
              onError={setError}
            />
          ) : null}
        </ProductGrid>
      )}
    </AppShell>
  );
}
