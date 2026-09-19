import assert from "node:assert/strict";
import test from "node:test";
import { NotFoundException } from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import type { AccountStore } from "../auth/account.types.js";
import { MemoryAttachmentStore } from "../attachments/attachment.store.js";
import type { KeyVaultService } from "../key-vault/key-vault.service.js";
import { MemoryStatementsExportStore } from "../statements/memory-statements-export.store.js";
import { RetentionController } from "./retention.controller.js";
import { RetentionService } from "./retention.service.js";

const actor: AuthActor = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  externalSubject: "sub",
  displayName: "Ops",
  authMode: "password",
};

function accountStore(
  platformRole: "user" | "platform_support" | "platform_owner",
): AccountStore {
  return {
    findById: async () => ({
      userId: actor.userId,
      platformRole,
      disabledAt: null,
    }),
  } as unknown as AccountStore;
}

test("G14 retention dry-run hides from non-platform user", async () => {
  const retention = new RetentionService(
    new MemoryStatementsExportStore(),
    new MemoryAttachmentStore(),
  );
  const controller = new RetentionController(
    retention,
    {} as KeyVaultService,
    accountStore("user"),
  );
  await assert.rejects(() => controller.dryRun(actor), (err: unknown) => {
    return err instanceof NotFoundException;
  });
});

test("G14 retention dry-run returns preview for platform_support", async () => {
  const exports = new MemoryStatementsExportStore();
  const past = new Date(Date.now() - 86_400_000).toISOString();
  await exports.create({
    id: "exp1",
    workspaceId: "ws1",
    subjectUserId: "u1",
    from: "2026-01-01",
    to: "2026-01-31",
    format: "csv",
    status: "ready",
    rowCount: 1,
    requestedByUserId: "u1",
    createdAt: past,
    body: "a,b\n1,2",
    mimeType: "text/csv",
    fileName: "x.csv",
    expiresAt: past,
  });
  const retention = new RetentionService(exports, new MemoryAttachmentStore());
  const controller = new RetentionController(
    retention,
    {} as KeyVaultService,
    accountStore("platform_support"),
  );
  const preview = await controller.dryRun(actor);
  assert.equal(preview.dryRun, true);
  assert.ok(preview.ranAt);
  assert.equal(preview.statementBodies, 1);
  assert.equal(await exports.countExpiredBodies(past), 1);
});
