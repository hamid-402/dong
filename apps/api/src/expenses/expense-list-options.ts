import { evaluateAccessPolicy, type MembershipRole } from "@dang/contracts";
import type { IamStore } from "../iam/iam.types.js";

/** Resolve private-expense elevation for مادرخرج / مدیر مالی (via ABAC). */
export async function resolveExpenseListOptions(
  iam: IamStore,
  workspaceId: string,
  userId: string,
): Promise<{ viewAllPrivate: boolean; role: MembershipRole | null }> {
  const members = (await iam.listMembers(workspaceId, userId)) ?? [];
  const role = members.find((m) => m.userId === userId)?.role ?? null;
  const decision = evaluateAccessPolicy({
    role,
    action: "expense.read_private",
    subjectUserId: userId,
    // Non-owner resource: only finance managers get elevation for "view all".
    resource: { ownerUserId: "__other__", visibility: "private" },
  });
  return { viewAllPrivate: decision.allowed, role };
}
