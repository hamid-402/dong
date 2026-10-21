/**
 * ClamAV fail-closed + stub path — mocks only (no real clamd).
 */
import assert from "node:assert/strict";
import { createServer, type AddressInfo, type Server } from "node:net";
import test from "node:test";
import { resolveAntivirusCapabilities } from "@dang/config";
import {
  downloadRequiresAvRescan,
  mayServeStoredAttachment,
} from "./av-policy.js";
import { clamavInstream, scanAttachmentContent } from "./av-scanner.js";

const HASH =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function sampleBytes(): Uint8Array {
  return new TextEncoder().encode("hello-attachment");
}

/** Minimal ClamAV-like TCP peer: reads until stream end, replies with fixed text. */
async function withMockClamd(
  reply: string,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((socket) => {
    socket.on("data", () => {
      /* drain INSTREAM payload */
    });
    // Reply after a short delay so client finishes writing.
    setTimeout(() => {
      socket.end(reply);
    }, 20);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  try {
    await run(port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("1) CLAMAV_ENABLED off → stub-av never returns error (several MIME/files)", async () => {
  const samples = [
    { fileName: "receipt.pdf", mimeType: "application/pdf" },
    { fileName: "a.jpg", mimeType: "image/jpeg" },
    { fileName: "b.png", mimeType: "image/png" },
    { fileName: "c.webp", mimeType: "image/webp" },
  ];
  for (const sample of samples) {
    const out = await scanAttachmentContent(
      {
        fileName: sample.fileName,
        mimeType: sample.mimeType,
        contentHash: HASH,
        bytes: sampleBytes(),
      },
      { env: { CLAMAV_ENABLED: "0", CLAMAV_HOST: "127.0.0.1" } },
    );
    assert.equal(out.engine, "stub-av");
    assert.notEqual(out.status, "error");
  }
});

test("2) enabled + mock OK → clean with engine clamav", async () => {
  await withMockClamd("stream: OK\0", async (port) => {
    const out = await scanAttachmentContent(
      {
        fileName: "ok.bin",
        mimeType: "application/octet-stream",
        contentHash: HASH,
        bytes: sampleBytes(),
      },
      {
        env: {
          CLAMAV_ENABLED: "1",
          CLAMAV_HOST: "127.0.0.1",
          CLAMAV_PORT: String(port),
        },
        timeoutMs: 3_000,
      },
    );
    assert.equal(out.engine, "clamav");
    assert.equal(out.status, "clean");
  });
});

test("3) enabled + mock FOUND → blocked", async () => {
  await withMockClamd("stream: Eicar-Test-Signature FOUND\0", async (port) => {
    const out = await scanAttachmentContent(
      {
        fileName: "eicar.com",
        mimeType: "application/octet-stream",
        contentHash: HASH,
        bytes: sampleBytes(),
      },
      {
        env: {
          CLAMAV_ENABLED: "1",
          CLAMAV_HOST: "127.0.0.1",
          CLAMAV_PORT: String(port),
        },
        timeoutMs: 3_000,
      },
    );
    assert.equal(out.engine, "clamav");
    assert.equal(out.status, "blocked");
  });
});

test("4a) enabled + closed port → error, never clean (fail-closed)", async () => {
  const out = await scanAttachmentContent(
    {
      fileName: "x.bin",
      mimeType: "application/octet-stream",
      contentHash: HASH,
      bytes: sampleBytes(),
    },
    {
      env: {
        CLAMAV_ENABLED: "1",
        CLAMAV_HOST: "127.0.0.1",
        CLAMAV_PORT: "1",
      },
      timeoutMs: 500,
    },
  );
  assert.equal(out.engine, "clamav");
  assert.equal(out.status, "error");
  assert.notEqual(out.status, "clean");
});

test("4b) enabled + empty CLAMAV_HOST → error, never clean", async () => {
  const out = await scanAttachmentContent(
    {
      fileName: "x.bin",
      mimeType: "application/octet-stream",
      contentHash: HASH,
      bytes: sampleBytes(),
    },
    { env: { CLAMAV_ENABLED: "1", CLAMAV_HOST: "" } },
  );
  assert.equal(out.engine, "clamav");
  assert.equal(out.status, "error");
  assert.match(String(out.detail), /CLAMAV_HOST_MISSING/);
});

test("4c) enabled + timeout → error, never clean", async () => {
  const server = createServer((socket) => {
    // Accept but never reply — forces client timeout.
    socket.on("data", () => undefined);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  try {
    const out = await scanAttachmentContent(
      {
        fileName: "slow.bin",
        mimeType: "application/octet-stream",
        contentHash: HASH,
        bytes: sampleBytes(),
      },
      {
        env: {
          CLAMAV_ENABLED: "1",
          CLAMAV_HOST: "127.0.0.1",
          CLAMAV_PORT: String(port),
        },
        timeoutMs: 200,
      },
    );
    assert.equal(out.status, "error");
    assert.match(String(out.detail), /CLAMAV_TIMEOUT/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("5) ClamAV down: previously clean still downloadable; error/blocked not; no rescan", async () => {
  assert.equal(downloadRequiresAvRescan(), false);
  assert.equal(mayServeStoredAttachment("clean"), true);
  assert.equal(mayServeStoredAttachment("error"), false);
  assert.equal(mayServeStoredAttachment("blocked"), false);

  let scanCalls = 0;
  const instream = async () => {
    scanCalls += 1;
    throw new Error("CLAMAV_DOWN");
  };
  // New upload path would fail-closed:
  const upload = await scanAttachmentContent(
    {
      fileName: "new.bin",
      mimeType: "application/octet-stream",
      contentHash: HASH,
      bytes: sampleBytes(),
    },
    {
      env: {
        CLAMAV_ENABLED: "1",
        CLAMAV_HOST: "127.0.0.1",
        CLAMAV_PORT: "1",
      },
      instream,
      timeoutMs: 200,
    },
  );
  assert.equal(upload.status, "error");
  assert.equal(scanCalls, 1);

  // Download path: use stored status only — must not call instream again.
  assert.equal(mayServeStoredAttachment("clean"), true);
  assert.equal(downloadRequiresAvRescan(), false);
  assert.equal(scanCalls, 1, "download must not invoke AV again");
});

test("6) capabilities honest: off → stub; on+host → configured", () => {
  const off = resolveAntivirusCapabilities({ CLAMAV_ENABLED: "0" });
  assert.equal(off.avScanStub, true);
  assert.equal(off.antivirus, "stub");

  const on = resolveAntivirusCapabilities({
    CLAMAV_ENABLED: "1",
    CLAMAV_HOST: "127.0.0.1",
  });
  assert.equal(on.avScanStub, false);
  assert.equal(on.antivirus, "configured");

  const enabledNoHost = resolveAntivirusCapabilities({
    CLAMAV_ENABLED: "1",
    CLAMAV_HOST: "",
  });
  assert.equal(enabledNoHost.avScanStub, true);
  assert.equal(enabledNoHost.antivirus, "stub");
});

test("injected instream OK/FOUND without TCP", async () => {
  const ok = await scanAttachmentContent(
    {
      fileName: "a.bin",
      mimeType: "application/octet-stream",
      contentHash: HASH,
      bytes: sampleBytes(),
    },
    {
      env: { CLAMAV_ENABLED: "1", CLAMAV_HOST: "127.0.0.1" },
      instream: async () => ({ infected: false, detail: "OK" }),
    },
  );
  assert.equal(ok.status, "clean");
  assert.equal(ok.engine, "clamav");

  const found = await scanAttachmentContent(
    {
      fileName: "b.bin",
      mimeType: "application/octet-stream",
      contentHash: HASH,
      bytes: sampleBytes(),
    },
    {
      env: { CLAMAV_ENABLED: "1", CLAMAV_HOST: "127.0.0.1" },
      instream: async () => ({ infected: true, detail: "FOUND" }),
    },
  );
  assert.equal(found.status, "blocked");
});

test("clamavInstream parses OK from live mock socket", async () => {
  await withMockClamd("stream: OK\0", async (port) => {
    const result = await clamavInstream(sampleBytes(), {
      host: "127.0.0.1",
      port,
      timeoutMs: 3_000,
    });
    assert.equal(result.infected, false);
  });
});
