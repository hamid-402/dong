"use client";

import type {
  MembershipSummary,
  PaymentLinkSummary,
  PettyCashFundSummary,
  SettlePayIntent,
  SettlementSummary,
  SpaceKind,
  WorkspaceBalancesResponse,
} from "@dang/contracts";
import { formatMoneyFromIrrMinor } from "@dang/ui";
import { HeroBalance, ProductGrid } from "@/components/ui-blocks";
import { SettlementPanel } from "@/components/views/finance/settlement-panel";
import { DebtSimplifyPanel } from "@/components/views/friends-group/debt-simplify-panel";
import { useDisplayUnit } from "@/lib/display-unit";
import { irrMinorToDisplayInput } from "@/lib/irr-money";
import { moneyUnitSuffix } from "@/lib/money-labels";
import { NAV_LABELS } from "@/lib/nav-labels";
import { zeroSumHint } from "@/lib/status-labels";

export function FinanceSettlementsSection(props: {
  myNetMinor: string | number;
  balances: WorkspaceBalancesResponse | null;
  onGoExpenses: () => void;
  workspaceId: string;
  members: MembershipSummary[];
  settleToUserId: string;
  onSettleToUserIdChange: (v: string) => void;
  settleAmountToman: string;
  onSettleAmountTomanChange: (v: string) => void;
  settlements: SettlementSummary[];
  paymentLinks: PaymentLinkSummary[];
  paymentsLive: boolean;
  pettyCashFunds: PettyCashFundSummary[];
  spaceKind: SpaceKind | null;
  currentUserId: string | undefined;
  myRole: string | undefined;
  readOnlyFinance: boolean;
  pending: boolean;
  settlementNps: boolean;
  onDismissNps: () => void;
  memberLabel: (userId: string) => string;
  membersHref: string;
  slug: string | null;
  onSettlePay: (input: {
    intent: SettlePayIntent;
    fundId?: string;
    asOf?: string;
  }) => void;
  onConfirmSettlement: (id: string) => void;
  onDisputeSettlement: (id: string) => void;
  evidenceRequired: boolean;
  onCancelSettlement: (id: string) => void;
  onCreatePaymentLink: (settlement: SettlementSummary) => void;
  debtSimplifyEnabled: boolean;
  canManageFinance: boolean;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
  onDebtApplied: () => void;
}) {
  const unit = useDisplayUnit();
  const unitLabel = moneyUnitSuffix(unit);
  const net = Number(props.myNetMinor);
  return (
    <>
      <div className="heroGrid">
        <HeroBalance
          label="مانده خالص شما"
          amount={formatMoneyFromIrrMinor(Math.abs(net), unit)}
          subtitle={
            net >= 0 ? `${unitLabel} طلب دارید` : `${unitLabel} بدهکارید`
          }
          actionLabel={NAV_LABELS.expenses}
          onAction={props.onGoExpenses}
          hint={props.balances ? zeroSumHint(props.balances.zeroSum) : "…"}
        />
      </div>
      <ProductGrid>
        <SettlementPanel
          workspaceId={props.workspaceId}
          members={props.members}
          settleToUserId={props.settleToUserId}
          onSettleToUserIdChange={props.onSettleToUserIdChange}
          settleAmountToman={props.settleAmountToman}
          onSettleAmountTomanChange={props.onSettleAmountTomanChange}
          settlements={props.settlements}
          paymentLinks={props.paymentLinks}
          paymentsLive={props.paymentsLive}
          balances={props.balances}
          pettyCashFunds={props.pettyCashFunds}
          spaceKind={props.spaceKind}
          currentUserId={props.currentUserId}
          myRole={props.myRole}
          readOnly={props.readOnlyFinance}
          pending={props.pending}
          settlementNps={props.settlementNps}
          onDismissNps={props.onDismissNps}
          memberLabel={props.memberLabel}
          membersHref={props.membersHref}
          slug={props.slug}
          onSettlePay={props.onSettlePay}
          onConfirmSettlement={props.onConfirmSettlement}
          onDisputeSettlement={props.onDisputeSettlement}
          evidenceRequired={props.evidenceRequired}
          onCancelSettlement={props.onCancelSettlement}
          onCreatePaymentLink={props.onCreatePaymentLink}
        />
        {props.debtSimplifyEnabled ? (
          <DebtSimplifyPanel
            workspaceId={props.workspaceId}
            memberLabel={props.memberLabel}
            enabled
            currentUserId={props.currentUserId}
            readOnly={props.readOnlyFinance}
            canApplyClaims={props.canManageFinance}
            onError={props.onError}
            onSuccess={props.onSuccess}
            onApplied={props.onDebtApplied}
            onOpenSettle={(edge) => {
              if (!edge.actorPays) return;
              props.onSettleToUserIdChange(edge.counterpartyUserId);
              props.onSettleAmountTomanChange(
                irrMinorToDisplayInput(edge.amountMinor, unit),
              );
            }}
          />
        ) : null}
      </ProductGrid>
    </>
  );
}
