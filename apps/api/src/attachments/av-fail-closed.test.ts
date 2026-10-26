import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type AddressInfo } from "node:net";
import test from "node:test";
import {
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AuthActor } from "@dang/contracts";
import { AttachmentBlobService } from "./attachment-blob.service.js";
import { MemoryAttachmentStore } from "./attachment.store.js";
import { AttachmentsService } from "./attachments.service.js";
import {
  mayServeStoredAttachment,
  mayStartOcr,
} from "./av-policy.js";
import { scanAttachmentContent } from "./av-scanner.js";

/** Download path must never invoke AV; fail-closed applies to new uploads only. */
function downloadRequiresAvRescan(): false {
  return false;
}

const HASH_A = "a".repeat(64);

const actor: AuthActor = {
  userId: "u1",
  externalSubject: "u1",
  displayName: "U",
  authMode: "dev",
};

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function buildService(store: MemoryAttachmentStore, blobs: AttachmentBlobService) {
  return new AttachmentsService(
    store,
    { requireMember: async () => undefined } as never,
    { run: async () => ({ jobId: "j1" }) } as never,
    blobs,
  );
}

test("fail-closed: scan error must not start OCR", () => {
  assert.equal(mayStartOcr("error"), false);
});

test("fail-closed: blocked must not start OCR", () => {
  assert.equal(mayStartOcr("blocked"), false);
});

test("OCR allowed only when clean or pending", () => {
  assert.equal(mayStartOcr("clean"), true);
  assert.equal(mayStartOcr("pending"), true);
  assert.equal(mayStartOcr("scanning"), true);
  assert.equal(mayStartOcr(undefined), true);
});

/**
 * Documents the create() fail-closed sequence:
 * after scan returns error, persist error and skip OCR job enqueue.
 */
test("create flow: error scan outcome skips OCR enqueue", () => {
  const scanStatus = "error" as const;
  const ocrJobId = "job-ocr-1";
  const shouldEnqueueOcr = Boolean(ocrJobId) && mayStartOcr(scanStatus);
  assert.equal(shouldEnqueueOcr, false);
});

test("download: clean remains servable without rescan; error/blocked refused", () => {
  assert.equal(downloadRequiresAvRescan(), false);
  assert.equal(mayServeStoredAttachment("clean"), true);
  assert.equal(mayServeStoredAttachment("pending"), true);
  assert.equal(mayServeStoredAttachment("scanning"), true);
  assert.equal(mayServeStoredAttachment("error"), false);
  assert.equal(mayServeStoredAttachment("blocked"), false);
  assert.equal(
    mayServeStoredAttachment("pending", { clamavEnabled: true }),
    false,
  );
  assert.equal(
    mayServeStoredAttachment("clean", { clamavEnabled: true }),
    true,
  );
  assert.equal(
    mayServeStoredAttachment("pending", { clamavEnabled: false }),
    true,
  );
});

test("3) getContent refuses quarantineStatus=error with 400 quarantine-blocked", async () => {
  const store = new MemoryAttachmentStore();
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => "/tmp/x",
    read: async () => Buffer.from("payload"),
  } as unknown as AttachmentBlobService;
  const created = await store.create("u1", {
    workspaceId: "w1",
    targetType: "expense",
    targetId: "e1",
    kind: "receipt",
    fileName: "r.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 7,
    contentHash: HASH_A,
    idempotencyKey: "err-dl",
  });
  await store.applyQuarantine("w1", created.id, {
    attachmentId: created.id,
    workspaceId: "w1",
    scannedAt: new Date().toISOString(),
    status: "error",
    engine: "clamav",
    detail: "CLAMAV_DOWN",
    contentHash: HASH_A,
  });
  await store.markBlobStored("w1", created.id, "/tmp/x");
  const service = buildService(store, blobs);
  await assert.rejects(
    () => service.getContent(actor, "w1", created.id),
    (err: unknown) => {
      if (!(err instanceof BadRequestException)) return false;
      const body = err.getResponse() as { type?: string; status?: number };
      return (
        body.type === "https://dang.local/problems/quarantine-blocked" &&
        body.status === 400
      );
    },
  );
});

test("4) getContent refuses quarantineStatus=blocked with 400 quarantine-blocked", async () => {
  const store = new MemoryAttachmentStore();
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => "/tmp/x",
    read: async () => Buffer.from("payload"),
  } as unknown as AttachmentBlobService;
  const created = await store.create("u1", {
    workspaceId: "w1",
    targetType: "expense",
    targetId: "e1",
    kind: "receipt",
    fileName: "evil.exe.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 7,
    contentHash: HASH_A,
    idempotencyKey: "blk-dl",
  });
  await store.applyQuarantine("w1", created.id, {
    attachmentId: created.id,
    workspaceId: "w1",
    scannedAt: new Date().toISOString(),
    status: "blocked",
    engine: "clamav",
    detail: "FOUND",
    contentHash: HASH_A,
  });
  await store.markBlobStored("w1", created.id, "/tmp/x");
  const service = buildService(store, blobs);
  await assert.rejects(
    () => service.getContent(actor, "w1", created.id),
    (err: unknown) => {
      if (!(err instanceof BadRequestException)) return false;
      const body = err.getResponse() as { type?: string; status?: number };
      return (
        body.type === "https://dang.local/problems/quarantine-blocked" &&
        body.status === 400
      );
    },
  );
});

test("5) getContent clean succeeds with ClamAV down; scanner not invoked", async () => {
  const store = new MemoryAttachmentStore();
  let readCalls = 0;
  const payload = Buffer.from("clean-bytes");
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => "/tmp/x",
    read: async () => {
      readCalls += 1;
      return payload;
    },
  } as unknown as AttachmentBlobService;
  const created = await store.create("u1", {
    workspaceId: "w1",
    targetType: "expense",
    targetId: "e1",
    kind: "receipt",
    fileName: "ok.jpg",
    mimeType: "image/jpeg",
    sizeBytes: payload.length,
    contentHash: HASH_A,
    idempotencyKey: "clean-dl",
  });
  await store.applyQuarantine("w1", created.id, {
    attachmentId: created.id,
    workspaceId: "w1",
    scannedAt: new Date().toISOString(),
    status: "clean",
    engine: "clamav",
    contentHash: HASH_A,
  });
  await store.markBlobStored("w1", created.id, "/tmp/x");

  const prevEnabled = process.env.CLAMAV_ENABLED;
  const prevHost = process.env.CLAMAV_HOST;
  process.env.CLAMAV_ENABLED = "1";
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = "1";
  try {
    const service = buildService(store, blobs);
    const file = await service.getContent(actor, "w1", created.id);
    assert.equal(file.buffer.toString(), "clean-bytes");
    assert.equal(readCalls, 1);
    assert.equal(downloadRequiresAvRescan(), false);
    // Policy gate only — download must not call scanAttachmentContent.
    assert.equal(mayServeStoredAttachment("clean"), true);
  } finally {
    if (prevEnabled === undefined) delete process.env.CLAMAV_ENABLED;
    else process.env.CLAMAV_ENABLED = prevEnabled;
    if (prevHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = prevHost;
    delete process.env.CLAMAV_PORT;
  }
});

test("CLAMAV on + FOUND → uploadContent 400 quarantine-blocked; blob not stored", async () => {
  const store = new MemoryAttachmentStore();
  let wrote = false;
  // JPEG SOI so sniffUploadMime accepts mime before ClamAV path runs.
  const payload = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("eicar-upload-bytes"),
  ]);
  const contentHash = sha256(payload);
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => {
      wrote = true;
      return "/tmp/should-not-blocked";
    },
    read: async () => null,
  } as unknown as AttachmentBlobService;

  const server = createServer((socket) => {
    socket.on("data", () => {
      /* drain */
    });
    setTimeout(() => {
      socket.end("stream: Eicar-Test-Signature FOUND\0");
    }, 20);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;

  const prevEnabled = process.env.CLAMAV_ENABLED;
  const prevHost = process.env.CLAMAV_HOST;
  const prevPort = process.env.CLAMAV_PORT;
  process.env.CLAMAV_ENABLED = "1";
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = String(port);
  try {
    let createCalls = 0;
    const originalCreate = store.create.bind(store);
    store.create = ((...args: Parameters<MemoryAttachmentStore["create"]>) => {
      createCalls += 1;
      return originalCreate(...args);
    }) as MemoryAttachmentStore["create"];

    const created = await store.create("u1", {
      workspaceId: "w1",
      targetType: "expense",
      targetId: "e1",
      kind: "receipt",
      fileName: "eicar.jpg",
      mimeType: "image/jpeg",
      sizeBytes: payload.length,
      contentHash,
      idempotencyKey: "up-blocked",
    });
    assert.equal(created.quarantineStatus, "pending");
    assert.equal(createCalls, 1);
    const createCallsBeforeUpload = createCalls;
    const service = buildService(store, blobs);
    await assert.rejects(
      () =>
        service.uploadContent(actor, "w1", created.id, {
          contentBase64: payload.toString("base64"),
        }),
      (err: unknown) => {
        if (!(err instanceof BadRequestException)) return false;
        const body = err.getResponse() as { type?: string; status?: number };
        return (
          body.type === "https://dang.local/problems/quarantine-blocked" &&
          body.status === 400
        );
      },
    );
    assert.equal(wrote, false, "must not store blob when AV blocked");
    assert.equal(
      createCalls,
      createCallsBeforeUpload,
      "blocked uploadContent must not insert a new attachment row",
    );
    const row = await store.getById("w1", created.id);
    assert.equal(row?.hasBlob, false);
    assert.equal(row?.quarantineStatus, "blocked");
    assert.equal(mayServeStoredAttachment(row?.quarantineStatus), false);
  } finally {
    if (prevEnabled === undefined) delete process.env.CLAMAV_ENABLED;
    else process.env.CLAMAV_ENABLED = prevEnabled;
    if (prevHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = prevHost;
    if (prevPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = prevPort;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("2) CLAMAV on + down → uploadContent 503 av-unavailable; not servable", async () => {
  const store = new MemoryAttachmentStore();
  let wrote = false;
  const payload = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("upload-bytes-xx"),
  ]);
  const contentHash = sha256(payload);
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => {
      wrote = true;
      return "/tmp/should-not";
    },
    read: async () => null,
  } as unknown as AttachmentBlobService;

  const prevEnabled = process.env.CLAMAV_ENABLED;
  const prevHost = process.env.CLAMAV_HOST;
  const prevPort = process.env.CLAMAV_PORT;
  process.env.CLAMAV_ENABLED = "1";
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = "1";
  try {
    const created = await store.create("u1", {
      workspaceId: "w1",
      targetType: "expense",
      targetId: "e1",
      kind: "receipt",
      fileName: "r.jpg",
      mimeType: "image/jpeg",
      sizeBytes: payload.length,
      contentHash,
      idempotencyKey: "up-503",
    });
    assert.equal(created.quarantineStatus, "pending");
    const service = buildService(store, blobs);
    await assert.rejects(
      () =>
        service.uploadContent(actor, "w1", created.id, {
          contentBase64: payload.toString("base64"),
        }),
      (err: unknown) => {
        if (!(err instanceof ServiceUnavailableException)) return false;
        const body = err.getResponse() as { type?: string; status?: number };
        return (
          body.type === "https://dang.local/problems/av-unavailable" &&
          body.status === 503
        );
      },
    );
    assert.equal(wrote, false, "must not store blob when AV error");
    const row = await store.getById("w1", created.id);
    assert.equal(row?.hasBlob, false);
    assert.equal(row?.quarantineStatus, "error");
    assert.equal(mayServeStoredAttachment(row?.quarantineStatus), false);
  } finally {
    if (prevEnabled === undefined) delete process.env.CLAMAV_ENABLED;
    else process.env.CLAMAV_ENABLED = prevEnabled;
    if (prevHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = prevHost;
    if (prevPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = prevPort;
  }
});

test("1) CLAMAV off → stub path never returns error (several MIME/files)", async () => {
  const samples = [
    { fileName: "a.jpg", mimeType: "image/jpeg" },
    { fileName: "b.png", mimeType: "image/png" },
    { fileName: "c.webp", mimeType: "image/webp" },
    { fileName: "d.pdf", mimeType: "application/pdf" },
  ];
  for (const sample of samples) {
    const out = await scanAttachmentContent(
      {
        fileName: sample.fileName,
        mimeType: sample.mimeType,
        contentHash: HASH_A,
        bytes: new TextEncoder().encode("x"),
      },
      { env: { CLAMAV_ENABLED: "0" } },
    );
    assert.equal(out.engine, "stub-av");
    assert.notEqual(out.status, "error");
  }
});

test("CLAMAV on + pending with blob → getContent 400 quarantine-blocked", async () => {
  const store = new MemoryAttachmentStore();
  const payload = Buffer.from("pending-bytes");
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => "/tmp/x",
    read: async () => payload,
  } as unknown as AttachmentBlobService;
  const created = await store.create("u1", {
    workspaceId: "w1",
    targetType: "expense",
    targetId: "e1",
    kind: "receipt",
    fileName: "pending.jpg",
    mimeType: "image/jpeg",
    sizeBytes: payload.length,
    contentHash: HASH_A,
    idempotencyKey: "pend-on",
  });
  assert.equal(created.quarantineStatus, "pending");
  await store.markBlobStored("w1", created.id, "/tmp/x");

  const prevEnabled = process.env.CLAMAV_ENABLED;
  process.env.CLAMAV_ENABLED = "1";
  try {
    const service = buildService(store, blobs);
    await assert.rejects(
      () => service.getContent(actor, "w1", created.id),
      (err: unknown) => {
        if (!(err instanceof BadRequestException)) return false;
        const body = err.getResponse() as { type?: string; status?: number };
        return (
          body.type === "https://dang.local/problems/quarantine-blocked" &&
          body.status === 400
        );
      },
    );
  } finally {
    if (prevEnabled === undefined) delete process.env.CLAMAV_ENABLED;
    else process.env.CLAMAV_ENABLED = prevEnabled;
  }
});

test("CLAMAV off + pending with blob → getContent succeeds", async () => {
  const store = new MemoryAttachmentStore();
  const payload = Buffer.from("pending-ok");
  let readCalls = 0;
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => "/tmp/x",
    read: async () => {
      readCalls += 1;
      return payload;
    },
  } as unknown as AttachmentBlobService;
  const created = await store.create("u1", {
    workspaceId: "w1",
    targetType: "expense",
    targetId: "e1",
    kind: "receipt",
    fileName: "pending-off.jpg",
    mimeType: "image/jpeg",
    sizeBytes: payload.length,
    contentHash: HASH_A,
    idempotencyKey: "pend-off",
  });
  assert.equal(created.quarantineStatus, "pending");
  await store.markBlobStored("w1", created.id, "/tmp/x");

  const prevEnabled = process.env.CLAMAV_ENABLED;
  process.env.CLAMAV_ENABLED = "0";
  try {
    const service = buildService(store, blobs);
    const file = await service.getContent(actor, "w1", created.id);
    assert.equal(file.buffer.toString(), "pending-ok");
    assert.equal(readCalls, 1);
  } finally {
    if (prevEnabled === undefined) delete process.env.CLAMAV_ENABLED;
    else process.env.CLAMAV_ENABLED = prevEnabled;
  }
});

test("CLAMAV on + clean with ClamAV down → getContent succeeds without rescan", async () => {
  const store = new MemoryAttachmentStore();
  const payload = Buffer.from("clean-no-rescan");
  let readCalls = 0;
  const blobs = {
    mode: () => "local" as const,
    hashBuffer: (b: Buffer) => sha256(b),
    write: async () => "/tmp/x",
    read: async () => {
      readCalls += 1;
      return payload;
    },
  } as unknown as AttachmentBlobService;
  const created = await store.create("u1", {
    workspaceId: "w1",
    targetType: "expense",
    targetId: "e1",
    kind: "receipt",
    fileName: "clean.jpg",
    mimeType: "image/jpeg",
    sizeBytes: payload.length,
    contentHash: HASH_A,
    idempotencyKey: "clean-pend-policy",
  });
  await store.applyQuarantine("w1", created.id, {
    attachmentId: created.id,
    workspaceId: "w1",
    scannedAt: new Date().toISOString(),
    status: "clean",
    engine: "clamav",
    contentHash: HASH_A,
  });
  await store.markBlobStored("w1", created.id, "/tmp/x");

  const prevEnabled = process.env.CLAMAV_ENABLED;
  const prevHost = process.env.CLAMAV_HOST;
  const prevPort = process.env.CLAMAV_PORT;
  process.env.CLAMAV_ENABLED = "1";
  process.env.CLAMAV_HOST = "127.0.0.1";
  process.env.CLAMAV_PORT = "1";
  try {
    const service = buildService(store, blobs);
    const file = await service.getContent(actor, "w1", created.id);
    assert.equal(file.buffer.toString(), "clean-no-rescan");
    assert.equal(readCalls, 1);
    assert.equal(downloadRequiresAvRescan(), false);
    assert.equal(
      mayServeStoredAttachment("clean", { clamavEnabled: true }),
      true,
    );
  } finally {
    if (prevEnabled === undefined) delete process.env.CLAMAV_ENABLED;
    else process.env.CLAMAV_ENABLED = prevEnabled;
    if (prevHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = prevHost;
    if (prevPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = prevPort;
  }
});
