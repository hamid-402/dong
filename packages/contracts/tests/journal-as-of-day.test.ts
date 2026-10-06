import assert from "node:assert/strict";
import test from "node:test";
import { journalAsOfDay, type JournalEntrySummary } from "../src/finance.js";

test("journalAsOfDay prefers occurredOn over createdAt", () => {
  const entry = {
    createdAt: "2026-09-20T12:00:00.000Z",
    occurredOn: "2026-08-01",
  } as Pick<JournalEntrySummary, "createdAt" | "occurredOn">;
  assert.equal(journalAsOfDay(entry), "2026-08-01");
});

test("journalAsOfDay falls back to createdAt day", () => {
  assert.equal(
    journalAsOfDay({ createdAt: "2026-09-20T12:00:00.000Z" }),
    "2026-09-20",
  );
});
