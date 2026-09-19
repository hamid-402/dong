import { expect, test } from "vitest";
import type { NotificationSummary } from "@dang/contracts";
import {
  notificationInboxActions,
  notificationTargetHref,
} from "./notification-routes";

function note(
  event: string,
  extra: Record<string, string> = {},
): NotificationSummary {
  return {
    id: "n1",
    workspaceId: "ws1",
    userId: "u1",
    channel: "in_app",
    title: "t",
    body: "b",
    createdAt: new Date().toISOString(),
    metadata: { event, ...extra },
  };
}

test("statement.ready uses metadata.href when internal", () => {
  const href = "/w/acme/statements/user-9?from=2026-09-01&to=2026-09-30";
  expect(notificationTargetHref(note("statement.ready", { href }), "acme")).toBe(
    href,
  );
});

test("statement.ready rejects protocol-relative href and falls back to statements", () => {
  expect(
    notificationTargetHref(
      note("statement.ready", { href: "//evil.example/x" }),
      "acme",
    ),
  ).toBe("/w/acme/statements");
});

test("statement.ready without href falls back to workspace statements", () => {
  expect(notificationTargetHref(note("statement.ready"), "acme")).toBe(
    "/w/acme/statements",
  );
});

test("expense.posted deep-links expense id", () => {
  expect(
    notificationTargetHref(note("expense.posted", { expenseId: "exp-9" }), "acme"),
  ).toBe("/w/acme/expenses?expense=exp-9#expense-panel");
});

test("approval.pending routes to approvals with approve action", () => {
  expect(notificationTargetHref(note("approval.pending"), "acme")).toBe(
    "/w/acme/approvals",
  );
  expect(notificationInboxActions(note("approval.pending"))).toEqual([
    "approve",
    "open",
  ]);
});

test("debt remind exposes settle action", () => {
  expect(notificationInboxActions(note("group.debt.remind"))).toEqual([
    "settle",
    "open",
  ]);
});

test("metadata.actions overrides heuristics", () => {
  expect(
    notificationInboxActions(note("expense.posted", { actions: "open,settle" })),
  ).toEqual(["open", "settle"]);
});
