import assert from "node:assert/strict";
import test from "node:test";
import { primaryCounterpartyEdge } from "../src/finance.js";

test("primary edge names the largest counterparty for the actor", () => {
  const lines = [
    { userId: "ali", partyKind: "member" as const, net: { amountMinor: "-300", currency: "IRR" as const } },
    { userId: "sara", partyKind: "member" as const, net: { amountMinor: "200", currency: "IRR" as const } },
    { userId: "reza", partyKind: "member" as const, net: { amountMinor: "100", currency: "IRR" as const } },
  ];
  const edge = primaryCounterpartyEdge(lines, "ali");
  assert.equal(edge?.direction, "debt");
  assert.equal(edge?.counterpartyId, "sara");
  assert.equal(edge?.amountMinor, "200");
  assert.equal(primaryCounterpartyEdge(lines, "sara")?.direction, "credit");
  assert.equal(primaryCounterpartyEdge([], "ali"), null);
});
