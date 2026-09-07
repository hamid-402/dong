import assert from "node:assert/strict";
import test from "node:test";
import type { CreatePersonalAddonChargeRequest } from "@dang/contracts";
import { MemoryAddonChargeStore } from "./memory-addon-charge.store.js";

function request(
  idempotencyKey: string,
): CreatePersonalAddonChargeRequest {
  return {
    targetMemberUserId: "target-user",
    amount: { amountMinor: "125000", currency: "IRR" },
    title: "Private add-on",
    idempotencyKey,
  };
}

test("add-on charge starts pending and can be confirmed once", async () => {
  const store = new MemoryAddonChargeStore();
  const created = await store.create(
    "workspace-1",
    "creator-user",
    request("addon-confirm"),
  );

  assert.equal(created.status, "pending_ack");

  const confirmed = await store.transition(
    "workspace-1",
    created.id,
    "target-user",
    "confirmed",
  );
  assert.equal(confirmed.status, "confirmed");
  assert.ok(confirmed.updatedAt >= confirmed.createdAt);

  await assert.rejects(
    store.transition(
      "workspace-1",
      created.id,
      "target-user",
      "disputed",
    ),
    /ADDON_CHARGE_STATUS/,
  );
});

test("pending add-on can be disputed with an acknowledgement note", async () => {
  const store = new MemoryAddonChargeStore();
  const created = await store.create(
    "workspace-1",
    "creator-user",
    request("addon-dispute"),
  );

  const disputed = await store.transition(
    "workspace-1",
    created.id,
    "target-user",
    "disputed",
    "This amount is not mine",
  );

  assert.equal(disputed.status, "disputed");
  assert.equal(disputed.note, "This amount is not mine");
});

test("create is idempotent and never auto-confirms", async () => {
  const store = new MemoryAddonChargeStore();
  const first = await store.create(
    "workspace-1",
    "target-user",
    request("addon-self"),
  );
  const second = await store.create(
    "workspace-1",
    "target-user",
    request("addon-self"),
  );

  assert.equal(second.id, first.id);
  assert.equal(second.status, "pending_ack");
});
