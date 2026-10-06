/**
 * Pure builders for the home briefing panel — only live counts, no invented work.
 */

export type HomeBriefingTone = "overdue" | "attention" | "info" | "calm";

export type HomeBriefingAction = {
  key: string;
  label: string;
  detail: string;
  href: string;
  count: number;
  tone: HomeBriefingTone;
};

export type HomeBriefingAlert = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  kind: "notification" | "audit";
};

export function buildHomeBriefingActions(input: {
  slug: string;
  pendingApprovals: number;
  approvalSlaBreached?: number;
  openSettlements: number;
  openNeeds: number;
  unreadNotifications: number;
  spaceKind?: string;
  approvalsHref: string;
  settlementsHref: string;
  needsHref: string;
}): HomeBriefingAction[] {
  const out: HomeBriefingAction[] = [];
  const breached = input.approvalSlaBreached ?? 0;

  if (input.pendingApprovals > 0) {
    out.push({
      key: "approvals",
      label: "تأیید در صف",
      detail:
        breached > 0
          ? `${breached.toLocaleString("fa-IR")} از مهلت گذشته · ${input.pendingApprovals.toLocaleString("fa-IR")} مورد`
          : `${input.pendingApprovals.toLocaleString("fa-IR")} مورد منتظر تصمیم`,
      href: input.approvalsHref,
      count: input.pendingApprovals,
      tone: breached > 0 ? "overdue" : "attention",
    });
  }

  if (input.openSettlements > 0) {
    out.push({
      key: "settlements",
      label: "تسویه باز",
      detail: `${input.openSettlements.toLocaleString("fa-IR")} تسویه هنوز تمام نشده`,
      href: input.settlementsHref,
      count: input.openSettlements,
      tone: "attention",
    });
  }

  if (input.openNeeds > 0) {
    out.push({
      key: "needs",
      label: "نیاز خرید",
      detail: `${input.openNeeds.toLocaleString("fa-IR")} نیاز باز`,
      href: input.needsHref,
      count: input.openNeeds,
      tone: "attention",
    });
  }

  if (input.unreadNotifications > 0) {
    out.push({
      key: "notifications",
      label: "اعلان خوانده‌نشده",
      detail: `${input.unreadNotifications.toLocaleString("fa-IR")} اعلان — از زنگولهٔ بالا هم باز می‌شود`,
      href: input.approvalsHref.includes("/approvals")
        ? input.settlementsHref.replace(/#.*$/, "") // fallback space-ish; overview passes better href
        : input.settlementsHref,
      count: input.unreadNotifications,
      tone: "info",
    });
  }

  return out;
}

/** Prefer a dedicated notifications/home anchor when provided. */
export function buildHomeBriefingActionsWithNotifyHref(
  input: Parameters<typeof buildHomeBriefingActions>[0] & {
    notificationsHref?: string;
  },
): HomeBriefingAction[] {
  const actions = buildHomeBriefingActions(input);
  if (!input.notificationsHref) return actions;
  return actions.map((a) =>
    a.key === "notifications"
      ? { ...a, href: input.notificationsHref! }
      : a,
  );
}

export function buildHomeBriefingAlerts(
  items: Array<{
    id: string;
    kind: "notification" | "audit";
    title: string;
    body?: string;
    href?: string;
    createdAt: string;
  }>,
  limit = 3,
): HomeBriefingAlert[] {
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    title: item.title,
    detail: item.body?.trim()
      ? item.body
      : item.kind === "notification"
        ? "اعلان"
        : "رویداد ممیزی",
    href: item.href,
    kind: item.kind,
  }));
}

export function homeBriefingHasWork(actions: readonly HomeBriefingAction[]): boolean {
  return actions.some((a) => a.count > 0);
}
