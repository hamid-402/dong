"use client";

import type { JournalEntrySummary } from "@dang/contracts";
import { ProductGrid } from "@/components/ui-blocks";
import { LedgerAuditPanels } from "@/components/views/finance/ledger-audit-panels";
import { WorkspaceReportsPanel } from "@/components/workspace-reports-panel";
import type { AuditEventDto } from "@/lib/api";

export function FinanceRecurringSection(props: {
  workspaceId: string;
  supportsCompany: boolean;
  readOnlyFinance: boolean;
  onReportsChanged: () => void;
  ledgerEntries: JournalEntrySummary[];
  auditEvents: AuditEventDto[];
  memberLabel: (userId: string) => string;
}) {
  return (
    <ProductGrid>
      <div id="reports-panel">
        <WorkspaceReportsPanel
          workspaceId={props.workspaceId}
          defaultVisibility={props.supportsCompany ? "company" : "shared"}
          readOnly={props.readOnlyFinance}
          onChanged={props.onReportsChanged}
        />
      </div>
      <ProductGrid cols={2}>
        <LedgerAuditPanels
          ledgerEntries={props.ledgerEntries}
          auditEvents={props.auditEvents}
          memberLabel={props.memberLabel}
        />
      </ProductGrid>
    </ProductGrid>
  );
}
