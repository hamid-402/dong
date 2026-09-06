import type { NotificationSummary } from "@dang/contracts";
import { hubPathFor } from "@/lib/hub-links";

/** Resolve in-app navigation from notification metadata (real API data). */
export function notificationTargetHref(notification: NotificationSummary): string | null {
  const event = notification.metadata?.event;
  if (event === "expense.posted") {
    return `${hubPathFor("/workspaces")}#expense-panel`;
  }
  if (event === "settlement.confirmed") {
    return `${hubPathFor("/workspaces")}#settlement-panel`;
  }
  if (event === "proposal.created" || event === "proposal.accepted") {
    return hubPathFor("/proposals");
  }
  if (event === "personal.budget.alert") {
    return hubPathFor("/me");
  }
  if (event === "group.debt.alert") {
    return `${hubPathFor("/workspaces")}#settlement-panel`;
  }
  const route = notification.metadata?.route;
  if (route?.startsWith("/")) {
    return hubPathFor(route);
  }
  return null;
}
