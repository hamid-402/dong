"use client";

import type { JournalEntrySummary } from "@dang/contracts";
import { DataList, DataRow, EmptyHint, SectionCard, StatusPill } from "@/components/ui-blocks";
import { auditResultLabel } from "@/lib/status-labels";
import type { AuditEventDto } from "@/lib/api";

type LedgerAuditPanelsProps = {
  ledgerEntries: JournalEntrySummary[];
  auditEvents: AuditEventDto[];
  memberLabel: (userId: string) => string;
};

/**
 * Read-only double-entry ledger + audit-event cards.
 * Extracted from finance-view.tsx (dong-50 #29) — pure projection of loaded data.
 */
export function LedgerAuditPanels({
  ledgerEntries,
  auditEvents,
  memberLabel,
}: LedgerAuditPanelsProps) {
  return (
    <>
      <SectionCard title="دفترکل" badge={ledgerEntries.length} delayClass="delay4">
        <DataList>
          {ledgerEntries.length === 0 ? (
            <EmptyHint>هنوز ورودی دفتر نیست — هزینه را ثبت نهایی کنید.</EmptyHint>
          ) : null}
          {ledgerEntries.map((entry) => (
            <DataRow
              key={entry.id}
              title={`${entry.sourceType}:${entry.sourceId.slice(0, 8)}`}
              meta={entry.lines
                .map((line) => `${line.side} ${memberLabel(line.userId)}`)
                .join(" · ")}
              trailing={`${entry.lines.length} خط`}
            />
          ))}
        </DataList>
      </SectionCard>
      <SectionCard title="رویدادهای Audit" badge={auditEvents.length} delayClass="delay4">
        <DataList>
          {auditEvents.length === 0 ? <EmptyHint>رویدادی نیست.</EmptyHint> : null}
          {auditEvents.slice(0, 12).map((event) => (
            <DataRow
              key={event.id}
              title={event.action}
              meta={`${event.targetType} · ${auditResultLabel(event.result)}`}
              trailing={
                <StatusPill tone={event.result === "success" ? "ok" : "warn"}>
                  {auditResultLabel(event.result)}
                </StatusPill>
              }
            />
          ))}
        </DataList>
      </SectionCard>
    </>
  );
}
