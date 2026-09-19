import assert from "node:assert/strict";
import test from "node:test";
import { generateMasterKey } from "../key-vault/vault-crypto.js";
import {
  openPayoutDestination,
  payoutDestinationEncryptionMode,
  resetPayoutDestinationCryptoCache,
  sealPayoutDestination,
} from "./payout-destination-crypto.js";
import { EncryptedPayoutInstructionsStore } from "./encrypted-payout-instructions.store.js";
import { MemoryPayoutInstructionsStore } from "./memory-payout-instructions.store.js";
import { MemoryStatementsExportStore } from "./memory-statements-export.store.js";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorId = "11111111-1111-4111-8111-111111111111";

test("seal/open payout destination with master key", () => {
  resetPayoutDestinationCryptoCache();
  process.env.DANG_MASTER_KEY = generateMasterKey().toString("base64");
  resetPayoutDestinationCryptoCache();
  assert.equal(payoutDestinationEncryptionMode(), "aes_gcm_v1");
  const sealed = sealPayoutDestination(workspaceId, "6393461063874330");
  assert.match(sealed, /^enc:v1:/);
  assert.equal(openPayoutDestination(workspaceId, sealed), "6393461063874330");
  // legacy plaintext passthrough
  assert.equal(openPayoutDestination(workspaceId, "IR120170000000123456789001"), "IR120170000000123456789001");
  delete process.env.DANG_MASTER_KEY;
  resetPayoutDestinationCryptoCache();
});

test("EncryptedPayoutInstructionsStore round-trip", async () => {
  resetPayoutDestinationCryptoCache();
  process.env.DANG_MASTER_KEY = generateMasterKey().toString("base64");
  resetPayoutDestinationCryptoCache();
  const inner = new MemoryPayoutInstructionsStore();
  const store = new EncryptedPayoutInstructionsStore(inner);
  const saved = await store.upsert(workspaceId, actorId, {
    holderName: "علی",
    destinationKind: "card",
    destinationValue: "6037997188123456",
  });
  assert.equal(saved.destinationValue, "6037997188123456");
  const raw = await inner.get(workspaceId, actorId);
  assert.ok(raw);
  assert.match(raw.destinationValue, /^enc:v1:/);
  const loaded = await store.get(workspaceId, actorId);
  assert.equal(loaded?.destinationValue, "6037997188123456");
  const cleared = await store.clear(workspaceId, actorId);
  assert.equal(cleared, true);
  assert.equal(await store.get(workspaceId, actorId), null);
  delete process.env.DANG_MASTER_KEY;
  resetPayoutDestinationCryptoCache();
});

test("export memory store purges expired bodies", async () => {
  const store = new MemoryStatementsExportStore();
  const past = new Date(Date.now() - 60_000).toISOString();
  const created = await store.create({
    id: "exp-1",
    workspaceId,
    subjectUserId: actorId,
    from: "2026-09-01",
    to: "2026-09-30",
    format: "csv",
    status: "ready",
    rowCount: 1,
    requestedByUserId: actorId,
    createdAt: past,
    completedAt: past,
    expiresAt: past,
    body: "a,b\n1,2",
    mimeType: "text/csv",
    fileName: "x.csv",
  });
  assert.ok(created.body);
  const purged = await store.purgeExpiredBodies();
  assert.equal(purged, 1);
  const got = await store.get(workspaceId, "exp-1", actorId);
  assert.equal(got?.body, undefined);
  assert.equal(got?.status, "failed");
});
