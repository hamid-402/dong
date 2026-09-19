import type { NotificationSummary } from "@dang/contracts";
import { absoluteForPage, classicPathToWorkspacePage, wPath } from "@/lib/workspace-paths";

export type NotificationInboxAction = "open" | "settle" | "approve";

/** Prefer explicit statement href from notify metadata when it is a same-origin path. */
function safeInternalHref(raw: string | undefined): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

function parseActions(raw: string | undefined): NotificationInboxAction[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is NotificationInboxAction =>
      part === "open" || part === "settle" || part === "approve",
    );
}

/** Resolve in-app navigation from notification metadata (slug-aware when possible). */
export function notificationTargetHref(
  notification: NotificationSummary,
  slug?: string | null,
): string | null {
  const event = notification.metadata?.event;
  const expenseId = notification.metadata?.expenseId;
  if (event === "statement.ready") {
    const href = safeInternalHref(notification.metadata?.href);
    if (href) return href;
    return slug ? wPath(slug, "statements") : absoluteForPage("statements", null);
  }
  if (event === "expense.posted" || event === "expense.approved" || event === "expense.rejected") {
    const base = slug ? wPath(slug, "expenses") : absoluteForPage("expenses", null);
    if (expenseId) return `${base}?expense=${encodeURIComponent(expenseId)}#expense-panel`;
    return `${base}#expense-panel`;
  }
  if (
    event === "settlement.confirmed" ||
    event === "settlement.proposed" ||
    event === "group.debt.alert" ||
    event === "group.debt.remind"
  ) {
    return slug
      ? `${wPath(slug, "settlements")}#settlement-panel`
      : absoluteForPage("settlements", null) + "#settlement-panel";
  }
  if (event === "proposal.created" || event === "proposal.accepted") {
    return slug ? wPath(slug, "proposals") : absoluteForPage("proposals", null);
  }
  if (
    event === "approval.pending" ||
    event === "approval.needed" ||
    event === "expense.submitted"
  ) {
    return slug ? wPath(slug, "approvals") : absoluteForPage("approvals", null);
  }
  if (event === "personal.budget.alert") {
    return slug ? wPath(slug, "space") : absoluteForPage("space", null);
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

/** Derive CTA actions from metadata.actions or event heuristics. */
export function notificationInboxActions(
  notification: NotificationSummary,
): NotificationInboxAction[] {
  const fromMeta = parseActions(notification.metadata?.actions);
  if (fromMeta.length > 0) return fromMeta;

  const event = notification.metadata?.event;
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
  if (notificationTargetHref(notification, null) || notification.metadata?.route) {
    return ["open"];
  }
  return [];
}

export function notificationActionLabel(action: NotificationInboxAction): string {
  if (action === "settle") return "تسویه";
  if (action === "approve") return "تأیید";
  return "باز کردن";
}
