"use client";

import type {
  CostCenterSummary,
  ExpensePeriodSummary,
  ExpenseSummary,
  MembershipSummary,
  PettyCashFundSummary,
  SessionSummary,
  SpaceKind,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import { formatMoneyFromIrrMinor } from "@dang/ui";
import type { ReactNode } from "react";
import type { SplitComposerValue } from "@/components/split-composer";
import {
  HeroBalance,
  ProductGrid,
  SectionCard,
  StatusLine,
} from "@/components/ui-blocks";
import type { OcrFormHints } from "@/components/expense-receipt-upload";
import { ExpenseFormPanel } from "@/components/views/finance/expense-form-panel";
import { ExpenseListPanel } from "@/components/views/finance/expense-list-panel";
import { FinanceSummaryCard } from "@/components/views/finance/finance-summary-card";
import type { SplitPresetListItem } from "@/components/views/finance/finance-split-preset";
import type { ExpenseFilter } from "@/components/views/finance/expense-list-query";
import { useDisplayUnit } from "@/lib/display-unit";
import { moneyUnitSuffix } from "@/lib/money-labels";
import { NAV_LABELS } from "@/lib/nav-labels";
import { membershipRoleLabel, zeroSumHint } from "@/lib/status-labels";
import type { OfflineExpenseDraft } from "@/lib/offline-drafts";
import { wPath } from "@/lib/workspace-paths";

export type FinanceExpensesSectionProps = {
  myNetMinor: string | number;
  balances: WorkspaceBalancesResponse | null;
  onGoSettlements: () => void;
  memberLabel: (userId: string) => string;
  slug: string | null;
  currentUserId: string | undefined;
  canManageFinance: boolean;
  paymentsLive: boolean;
  onCreateSettleLink: (debtorUserId: string, debtAbsMinor: string) => void;
  pending: boolean;
  readOnlyFinance: boolean;
  filteredExpenses: ExpenseSummary[];
  expenseFilter: ExpenseFilter;
  onFilterChange: (v: ExpenseFilter) => void;
  expenseFrom: string;
  expenseTo: string;
  onExpenseFromChange: (v: string) => void;
  onExpenseToChange: (v: string) => void;
  catalogItemId: string;
  catalogOptions: Array<{ id: string; name: string }>;
  onCatalogItemIdChange?: (v: string) => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  paidByUserId: string;
  onPaidByUserIdChange: (v: string) => void;
  payerOptions: Array<{ id: string; name: string }>;
  categoryId: string;
  onCategoryIdChange: (v: string) => void;
  categoryOptions: Array<{ id: string; name: string }>;
  tagId: string;
  onTagIdChange: (v: string) => void;
  tagOptions: Array<{ id: string; name: string }>;
  ocrMode: "stub" | "configured";
  onApplyOcr: (hints: OcrFormHints) => void;
  supportsCompany: boolean;
  canApproveCompany: boolean;
  selectedId: string;
  initialExpenseId: string;
  onSubmitExpense: (expenseId: string) => void;
  onPostExpense: (expenseId: string) => void;
  onPromoteCompany: (expenseId: string) => void;
  onReverseExpense: (expenseId: string, reason: string) => void;
  onRestoreExpense?: (expenseId: string) => void;
  onPurgeExpense?: (expenseId: string) => void;
  onBeginReviseExpense: (expenseId: string, reason: string) => void;
  myMembershipRole: MembershipSummary["role"] | null | undefined;
  title: string;
  onTitleChange: (v: string) => void;
  amountToman: string;
  onAmountTomanChange: (v: string) => void;
  expenseDate: string;
  onExpenseDateChange: (v: string) => void;
  split: SplitComposerValue;
  onSplitChange: (v: SplitComposerValue) => void;
  expensePeriodId: string;
  onExpensePeriodIdChange: (v: string) => void;
  periods: ExpensePeriodSummary[];
  members: MembershipSummary[];
  session: SessionSummary | null;
  offlineDrafts: OfflineExpenseDraft[];
  lastDraftSavedAt: string | null;
  costCenters: CostCenterSummary[];
  costCenterId: string;
  onCostCenterIdChange: (v: string) => void;
  requireCostCenter: boolean;
  missionKind: "" | "advance" | "settlement";
  onMissionKindChange: (v: "" | "advance" | "settlement") => void;
  catalogEnabled: boolean;
  allowFormula: boolean;
  splitPresets: SplitPresetListItem[];
  onSaveSplitPreset: (name: string) => void;
  revisingExpenseId: string | null;
  onCancelRevise: () => void;
  spaceKind: SpaceKind;
  pettyCashFunds: PettyCashFundSummary[];
  fundingSourceKind: "" | "personal" | "petty_cash" | "member" | "credit";
  fundingRefId: string;
  onFundingSourceKindChange: (
    v: "" | "personal" | "petty_cash" | "member" | "credit",
  ) => void;
  onFundingRefIdChange: (v: string) => void;
  conversionLive?: boolean;
  originalCurrency?: string;
  onOriginalCurrencyChange?: (v: string) => void;
  originalAmountMajor?: string;
  onOriginalAmountMajorChange?: (v: string) => void;
  onCreateExpense: () => void;
  onSaveOfflineDraft: () => void;
  onSyncOfflineDraft: (draft: OfflineExpenseDraft) => void;
  onRemoveOfflineDraft: (draftId: string) => void;
  /** Layer-3 context (treasury, etc.) — kept available, folded by default. */
  contextPanels?: ReactNode;
  fundAsSettlementParty?: boolean;
};

export function FinanceExpensesSection(props: FinanceExpensesSectionProps) {
  const unit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(unit);
  const net = Number(props.myNetMinor);
  const friendLike =
    props.spaceKind === "group" || props.spaceKind === "personal";

  return (
    <div className="financeExpensesLayers">
      {/* Layer 1 — primary work: register then list */}
      {props.readOnlyFinance ? (
        <SectionCard title={NAV_LABELS.addExpense} tone="quiet">
          <StatusLine>
            نقش {membershipRoleLabel(props.myMembershipRole)} فقط مشاهده دارد — ثبت پول برای
            شما فعال نیست.
          </StatusLine>
        </SectionCard>
      ) : (
        <ProductGrid>
          <ExpenseFormPanel
            title={props.title}
            onTitleChange={props.onTitleChange}
            amountToman={props.amountToman}
            onAmountTomanChange={props.onAmountTomanChange}
            expenseDate={props.expenseDate}
            onExpenseDateChange={props.onExpenseDateChange}
            split={props.split}
            onSplitChange={props.onSplitChange}
            expensePeriodId={props.expensePeriodId}
            onExpensePeriodIdChange={props.onExpensePeriodIdChange}
            periods={props.periods}
            members={props.members}
            supportsCompany={props.supportsCompany}
            session={props.session}
            offlineDrafts={props.offlineDrafts}
            lastDraftSavedAt={props.lastDraftSavedAt}
            pending={props.pending}
            canAssignPrivateToOthers={props.canManageFinance}
            costCenters={props.costCenters}
            costCenterId={props.costCenterId}
            onCostCenterIdChange={props.onCostCenterIdChange}
            requireCostCenter={props.requireCostCenter}
            missionKind={props.missionKind}
            onMissionKindChange={props.onMissionKindChange}
            workspaceId={props.selectedId}
            catalogEnabled={props.catalogEnabled}
            allowFormula={props.allowFormula}
            splitPresets={props.splitPresets}
            onSaveSplitPreset={props.onSaveSplitPreset}
            savePresetPending={props.pending}
            revisingExpenseId={props.revisingExpenseId}
            onCancelRevise={props.onCancelRevise}
            spaceKind={props.spaceKind}
            pettyCashFunds={props.pettyCashFunds}
            fundingSourceKind={props.fundingSourceKind}
            fundingRefId={props.fundingRefId}
            onFundingSourceKindChange={props.onFundingSourceKindChange}
            onFundingRefIdChange={props.onFundingRefIdChange}
            conversionLive={props.conversionLive}
            originalCurrency={props.originalCurrency}
            onOriginalCurrencyChange={props.onOriginalCurrencyChange}
            originalAmountMajor={props.originalAmountMajor}
            onOriginalAmountMajorChange={props.onOriginalAmountMajorChange}
            ledgerHref={
              props.slug && props.spaceKind !== "personal"
                ? wPath(props.slug, "ledger")
                : null
            }
            onCreateExpense={props.onCreateExpense}
            onSaveOfflineDraft={props.onSaveOfflineDraft}
            onSyncOfflineDraft={props.onSyncOfflineDraft}
            onRemoveOfflineDraft={props.onRemoveOfflineDraft}
          />
        </ProductGrid>
      )}

      <ExpenseListPanel
        filteredExpenses={props.filteredExpenses}
        expenseFilter={props.expenseFilter}
        onFilterChange={props.onFilterChange}
        ledgerHref={
          props.slug && props.spaceKind !== "personal"
            ? wPath(props.slug, "ledger")
            : null
        }
        expenseFrom={props.expenseFrom}
        expenseTo={props.expenseTo}
        onExpenseFromChange={props.onExpenseFromChange}
        onExpenseToChange={props.onExpenseToChange}
        catalogItemId={props.catalogItemId}
        catalogOptions={props.catalogOptions}
        onCatalogItemIdChange={props.onCatalogItemIdChange}
        searchQuery={props.searchQuery}
        onSearchQueryChange={props.onSearchQueryChange}
        paidByUserId={props.paidByUserId}
        onPaidByUserIdChange={props.onPaidByUserIdChange}
        payerOptions={props.payerOptions}
        categoryId={props.categoryId}
        onCategoryIdChange={props.onCategoryIdChange}
        categoryOptions={props.categoryOptions}
        tagId={props.tagId}
        onTagIdChange={props.onTagIdChange}
        tagOptions={props.tagOptions}
        ocrMode={props.ocrMode}
        onApplyOcr={props.onApplyOcr}
        supportsCompany={props.supportsCompany}
        canApproveCompany={props.canApproveCompany}
        selectedId={props.selectedId}
        pending={props.pending}
        canManageFinance={props.canManageFinance}
        readOnly={props.readOnlyFinance}
        memberLabel={props.memberLabel}
        initialExpenseId={props.initialExpenseId}
        onSubmitExpense={props.onSubmitExpense}
        onPostExpense={props.onPostExpense}
        onPromoteCompany={props.onPromoteCompany}
        onReverseExpense={props.onReverseExpense}
        onRestoreExpense={props.onRestoreExpense}
        onPurgeExpense={props.onPurgeExpense}
        onBeginReviseExpense={props.onBeginReviseExpense}
        spaceKind={props.spaceKind}
        fundAsSettlementParty={props.fundAsSettlementParty}
      />

      {/* Layer 2 — my status */}
      <div className="heroGrid financeExpensesLayers__myBalance">
        <HeroBalance
          label="مانده خالص شما"
          amount={formatMoneyFromIrrMinor(Math.abs(net), unit)}
          subtitle={
            net >= 0 ? `${unitLabel} طلب دارید` : `${unitLabel} بدهکارید`
          }
          actionLabel={NAV_LABELS.settlements}
          onAction={props.onGoSettlements}
          hint={props.balances ? zeroSumHint(props.balances.zeroSum) : "…"}
        />
      </div>

      {/* Layer 3 — context: available, not competing with the work surface */}
      <details className="scrollDisclosure financeContextFold">
        <summary className="panelHeader">
          مانده همهٔ اعضا
          <span className="financeContextFold__hint">
            {friendLike ? "جزئیات تسویه در صفحهٔ تسویه" : "خلاصهٔ مانده‌ها"}
          </span>
        </summary>
        <div className="scrollDisclosure__body">
          <FinanceSummaryCard
            balances={props.balances}
            memberLabel={props.memberLabel}
            slug={props.slug}
            currentUserId={props.currentUserId}
            canManage={props.canManageFinance}
            paymentsLive={props.paymentsLive}
            onCreateSettleLink={props.onCreateSettleLink}
            pending={props.pending}
            readOnly={props.readOnlyFinance}
          />
        </div>
      </details>

      {props.contextPanels ? (
        <div className="financeExpensesLayers__context">{props.contextPanels}</div>
      ) : null}
    </div>
  );
}
