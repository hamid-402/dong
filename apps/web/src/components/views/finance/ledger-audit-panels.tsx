"use client";

import { journalAsOfDay, type JournalEntrySummary } from "@dang/contracts";
import { DataList, DataRow, EmptyHint, SectionCard, StatusPill } from "@/components/ui-blocks";
import { formatFaDate } from "@/lib/fa-datetime";
import { auditResultLabel } from "@/lib/status-labels";
import type { AuditEventDto } from "@/lib/api";

type LedgerAuditPanelsProps = {
  ledgerEntries: JournalEntrySummary[];
  auditEvents: AuditEventDto[];
  memberLabel: (userId: string) => string;
};

const JOURNAL_SOURCE_LABELS: Record<string, string> = {
  expense: "هزینه",
  settlement: "تسویه",
  payment_receipt: "رسید پرداخت",
  payment_on_behalf: "پرداخت به‌جای دیگری",
};

function journalSourceLabel(sourceType: string): string {
  return JOURNAL_SOURCE_LABELS[sourceType] ?? "سند مالی";
}

/** Credit side = who paid; debit side = who owes their share. */
function journalSideLabel(side: "debit" | "credit"): string {
  return side === "credit" ? "پرداخت‌کننده" : "سهم";
}

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
              title={`${journalSourceLabel(entry.sourceType)} · ${formatFaDate(journalAsOfDay(entry))}`}
              meta={entry.lines
                .map((line) => `${journalSideLabel(line.side)}: ${memberLabel(line.userId)}`)
                .join(" · ")}
              trailing={`${entry.lines.length} خط`}
            />
          ))}
        </DataList>
      </SectionCard>
      <SectionCard title="رویدادهای ثبت‌شده" badge={auditEvents.length} delayClass="delay4">
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
