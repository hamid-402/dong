import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPettyCashNoteMeta,
  parsePettyCashNoteMeta,
} from "./petty-cash-note.js";

test("parsePettyCashNoteMeta reads ASCII cashInBy and ledgerDate", () => {
  const meta = parsePettyCashNoteMeta(
    "واریز دفتر روزانه — 2026-09-24 (cashInBy:user-1 ledgerDate:2026-09-24)",
  );
  assert.equal(meta.cashInByUserId, "user-1");
  assert.equal(meta.ledgerDate, "2026-09-24");
});

test("parsePettyCashNoteMeta reads Persian واریزکننده", () => {
  const meta = parsePettyCashNoteMeta("هدیه (واریزکننده: alice_42)");
  assert.equal(meta.cashInByUserId, "alice_42");
});

test("appendPettyCashNoteMeta is idempotent for same cashInBy", () => {
  const once = appendPettyCashNoteMeta("واریز", {
    cashInByUserId: "u1",
    ledgerDate: "2026-09-24",
  });
  const twice = appendPettyCashNoteMeta(once, {
    cashInByUserId: "u1",
    ledgerDate: "2026-09-24",
  });
  assert.equal(once, twice);
  assert.match(once, /cashInBy:u1/);
  assert.match(once, /ledgerDate:2026-09-24/);
});
