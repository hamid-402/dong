/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  buildHomeBriefingActionsWithNotifyHref,
  buildHomeBriefingAlerts,
  homeBriefingHasWork,
} from "./home-briefing";

describe("home-briefing", () => {
  it("builds overdue approval when SLA breached", () => {
    const actions = buildHomeBriefingActionsWithNotifyHref({
      slug: "acme",
      pendingApprovals: 3,
      approvalSlaBreached: 2,
      openSettlements: 0,
      openNeeds: 0,
      unreadNotifications: 0,
      approvalsHref: "/w/acme/approvals",
      settlementsHref: "/w/acme/settlements",
      needsHref: "/w/acme/procurement",
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]?.tone).toBe("overdue");
    expect(actions[0]?.href).toBe("/w/acme/approvals");
  });

  it("stacks settlements needs and notifications", () => {
    const actions = buildHomeBriefingActionsWithNotifyHref({
      slug: "acme",
      pendingApprovals: 0,
      openSettlements: 2,
      openNeeds: 1,
      unreadNotifications: 4,
      approvalsHref: "/w/acme/approvals",
      settlementsHref: "/w/acme/settlements",
      needsHref: "/w/acme/procurement",
      notificationsHref: "/w/acme/home#home-briefing",
    });
    expect(actions.map((a) => a.key)).toEqual([
      "settlements",
      "needs",
      "notifications",
    ]);
    expect(actions.find((a) => a.key === "notifications")?.href).toContain(
      "#home-briefing",
    );
    expect(homeBriefingHasWork(actions)).toBe(true);
  });

  it("empty when nothing pending", () => {
    const actions = buildHomeBriefingActionsWithNotifyHref({
      slug: "acme",
      pendingApprovals: 0,
      openSettlements: 0,
      openNeeds: 0,
      unreadNotifications: 0,
      approvalsHref: "/w/acme/approvals",
      settlementsHref: "/w/acme/settlements",
      needsHref: "/w/acme/expenses",
    });
    expect(actions).toEqual([]);
    expect(homeBriefingHasWork(actions)).toBe(false);
  });

  it("limits alert preview", () => {
    const alerts = buildHomeBriefingAlerts(
      [
        {
          id: "1",
          kind: "notification",
          title: "A",
          createdAt: "2026-01-01",
        },
        {
          id: "2",
          kind: "audit",
          title: "B",
          body: "جزئیات",
          createdAt: "2026-01-02",
        },
        {
          id: "3",
          kind: "notification",
          title: "C",
          createdAt: "2026-01-03",
        },
        {
          id: "4",
          kind: "notification",
          title: "D",
          createdAt: "2026-01-04",
        },
      ],
      3,
    );
    expect(alerts).toHaveLength(3);
    expect(alerts[1]?.detail).toBe("جزئیات");
  });
});
