import type { NotificationSummary } from "@dang/contracts";
import { absoluteForPage, classicPathToWorkspacePage, wPath } from "@/lib/workspace-paths";

/** Resolve in-app navigation from notification metadata (slug-aware when possible). */
export function notificationTargetHref(
  notification: NotificationSummary,
  slug?: string | null,
): string | null {
  const event = notification.metadata?.event;
  if (event === "expense.posted") {
    return slug ? `${wPath(slug, "expenses")}#expense-panel` : absoluteForPage("expenses", null) + "#expense-panel";
  }
  if (event === "settlement.confirmed") {
    return slug
      ? `${wPath(slug, "settlements")}#settlement-panel`
      : absoluteForPage("settlements", null) + "#settlement-panel";
  }
  if (event === "proposal.created" || event === "proposal.accepted") {
    return slug ? wPath(slug, "proposals") : absoluteForPage("proposals", null);
  }
  if (event === "personal.budget.alert") {
    return slug ? wPath(slug, "space") : absoluteForPage("space", null);
  }
  if (event === "group.debt.alert") {
    return slug
      ? `${wPath(slug, "settlements")}#settlement-panel`
      : absoluteForPage("settlements", null) + "#settlement-panel";
  }
  const route = notification.metadata?.route;
  if (route?.startsWith("/")) {
    const page = classicPathToWorkspacePage(route);
    if (page && slug) return absoluteForPage(page, slug);
    if (page) return absoluteForPage(page, null);
    return route;
  }
  return null;
}
