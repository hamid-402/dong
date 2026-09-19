/** Helpers for actionable inbox metadata (G11 #43). */

export type NotificationInboxAction = "open" | "settle" | "approve";

export function notificationActionsForEvent(
  event: string | undefined,
): NotificationInboxAction[] {
  if (!event) return [];
  if (
    event === "approval.pending" ||
    event === "approval.needed" ||
    event === "expense.submitted"
  ) {
    return ["approve", "open"];
  }
  if (
    event === "group.debt.alert" ||
    event === "group.debt.remind" ||
    event === "settlement.proposed"
  ) {
    return ["settle", "open"];
  }
  if (
    event === "expense.posted" ||
    event === "expense.approved" ||
    event === "expense.rejected" ||
    event === "settlement.confirmed" ||
    event === "proposal.created" ||
    event === "proposal.accepted" ||
    event === "statement.ready" ||
    event === "invite.remind" ||
    event === "invite.accepted" ||
    event === "personal.budget.alert"
  ) {
    return ["open"];
  }
  return [];
}

/** Serialize actions for NotificationSummary.metadata (string map). */
export function serializeNotificationActions(
  actions: NotificationInboxAction[],
): string | undefined {
  if (actions.length === 0) return undefined;
  return actions.join(",");
}

export function enrichNotificationMetadata(
  metadata: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const event = metadata.event;
  const actions = notificationActionsForEvent(event);
  const serialized = serializeNotificationActions(actions);
  if (!serialized || metadata.actions) return metadata;
  return { ...metadata, actions: serialized };
}
