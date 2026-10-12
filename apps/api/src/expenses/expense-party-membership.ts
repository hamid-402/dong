export const EXPENSE_PARTY_NOT_MEMBER = "EXPENSE_PARTY_NOT_MEMBER";

export type ExpensePartyProblemCode = "PAYER_NOT_MEMBER" | "PARTICIPANT_NOT_MEMBER";

const PAYER_DETAIL = "پرداخت‌کننده عضو فعال این فضا نیست";
const PARTICIPANT_DETAIL = "شرکت‌کنندهٔ تقسیم عضو فعال این فضا نیست";

export class ExpensePartyNotMemberError extends Error {
  readonly code: ExpensePartyProblemCode;
  readonly detail: string;

  constructor(code: ExpensePartyProblemCode, detail: string) {
    super(EXPENSE_PARTY_NOT_MEMBER);
    this.name = "ExpensePartyNotMemberError";
    this.code = code;
    this.detail = detail;
  }
}

type PartyLine = { userId: string };

export function expensePartyUserIds(input: {
  paidByUserId: string;
  splits: PartyLine[];
  paymentLines?: PartyLine[];
}): string[] {
  const ids = new Set<string>();
  const payer = input.paidByUserId.trim();
  if (payer) ids.add(payer);
  for (const line of input.paymentLines ?? []) {
    const id = line.userId.trim();
    if (id) ids.add(id);
  }
  for (const line of input.splits) {
    const id = line.userId.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * paidByUserId, extra payment-line payers, and every split participant must be
 * active members (no disabledAt) of the same workspace.
 */
export function assertExpensePartiesAreActiveMembers(input: {
  paidByUserId: string;
  splits: PartyLine[];
  paymentLines?: PartyLine[];
  members: Array<{ userId: string; disabledAt?: string | null }>;
}): void {
  const active = new Set(
    input.members.filter((member) => !member.disabledAt).map((member) => member.userId),
  );
  const payer = input.paidByUserId.trim();
  if (!payer || !active.has(payer)) {
    throw new ExpensePartyNotMemberError("PAYER_NOT_MEMBER", PAYER_DETAIL);
  }
  for (const line of input.paymentLines ?? []) {
    const id = line.userId.trim();
    if (id && !active.has(id)) {
      throw new ExpensePartyNotMemberError("PAYER_NOT_MEMBER", PAYER_DETAIL);
    }
  }
  for (const line of input.splits) {
    const id = line.userId.trim();
    if (!id || !active.has(id)) {
      throw new ExpensePartyNotMemberError("PARTICIPANT_NOT_MEMBER", PARTICIPANT_DETAIL);
    }
  }
}
