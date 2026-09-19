import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAttachmentStore } from "../attachments/attachment.store.js";
import { MemoryStatementsExportStore } from "../statements/memory-statements-export.store.js";
import { RetentionService } from "./retention.service.js";

test("retention dry-run counts without purge (G12 #53)", async () => {
  const exports = new MemoryStatementsExportStore();
  const attachments = new MemoryAttachmentStore();
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
  const retention = new RetentionService(exports, attachments);
  const preview = await retention.previewPurge();
  assert.equal(preview.dryRun, true);
  assert.equal(preview.statementBodies, 1);
  assert.equal(await exports.countExpiredBodies(past), 1, "dry-run must not clear body");
  const purged = await retention.runPurge();
  assert.equal(purged.dryRun, false);
  assert.equal(purged.statementBodies, 1);
  assert.equal(await exports.countExpiredBodies(past), 0);
});
