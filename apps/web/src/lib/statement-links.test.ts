import { expect, test } from "vitest";
import {
  memberStatementHref,
  statementMonthBounds,
  statementsListHref,
} from "./statement-links";

test("statementMonthBounds returns ISO days for current month", () => {
  const fixed = new Date(Date.UTC(2026, 8, 15)); // Sep 2026
  const bounds = statementMonthBounds(fixed);
  expect(bounds.from).toBe("2026-09-01");
  expect(bounds.to).toBe("2026-09-30");
});

test("memberStatementHref encodes slug/user and range", () => {
  const href = memberStatementHref("acme", "user-9", {
    from: "2026-09-01",
    to: "2026-09-30",
  });
  expect(href).toBe("/w/acme/statements/user-9?from=2026-09-01&to=2026-09-30");
});

test("statementsListHref defaults to month bounds for fixed date via explicit range", () => {
  const href = statementsListHref("acme", {
    from: "2026-08-01",
    to: "2026-08-31",
    granularity: "day",
  });
  expect(href).toBe(
    "/w/acme/statements?from=2026-08-01&to=2026-08-31&granularity=day",
  );
});
