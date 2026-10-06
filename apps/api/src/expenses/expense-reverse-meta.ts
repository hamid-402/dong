/** Structured reverse provenance stored in expense.note (no schema migration). */

const MARKER =
  /\n?\[dang:rev\|by=([^|\]]+)\|at=([^|\]]+)\|reason=([^\]]*)\]\s*$/;

export type ExpenseReverseMeta = {
  reversedByUserId: string;
  reversedAt: string;
  reverseReason: string;
};

export function appendExpenseReverseMeta(
  note: string | undefined,
  meta: ExpenseReverseMeta,
): string {
  const base = stripExpenseReverseMeta(note ?? "").trimEnd();
  const reason = meta.reverseReason.replace(/[\]|]/g, " ").trim().slice(0, 400);
  const marker = `[dang:rev|by=${meta.reversedByUserId}|at=${meta.reversedAt}|reason=${reason}]`;
  return base ? `${base}\n${marker}` : marker;
}

export function stripExpenseReverseMeta(note: string): string {
  return note.replace(MARKER, "").trimEnd();
}

export function parseExpenseReverseMeta(
  note: string | undefined,
): ExpenseReverseMeta | null {
  if (!note) return null;
  const match = note.match(MARKER);
  if (!match) return null;
  return {
    reversedByUserId: match[1]!.trim(),
    reversedAt: match[2]!.trim(),
    reverseReason: match[3]!.trim() || "unspecified",
  };
}
