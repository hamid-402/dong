import { createConnection } from "node:net";
import {
  clamavHostPort,
  isClamavEnabled,
  isClamavHostConfigured,
} from "@dang/config";
import { evaluateQuarantine, type QuarantineStatus } from "@dang/contracts";

type EnvBag = Record<string, string | undefined>;

export type AvScanOutcome = {
  status: QuarantineStatus;
  engine: "stub-av" | "clamav";
  detail?: string;
  contentHash: string;
};

export type ClamavInstreamFn = (
  bytes: Uint8Array,
  options?: { host: string; port: number; timeoutMs?: number },
) => Promise<{ infected: boolean; detail?: string }>;

export type ScanAttachmentDeps = {
  /** Override process.env for tests (never log values). */
  env?: EnvBag;
  /** Inject ClamAV INSTREAM (mock TCP or fake). */
  instream?: ClamavInstreamFn;
  /** Override default 15s ClamAV socket timeout. */
  timeoutMs?: number;
};

/**
 * Prefer ClamAV when CLAMAV_ENABLED=1; otherwise MIME/heuristic stub.
 * Fail-closed for *new* scans when enabled: missing host, connect/timeout/error
 * → status error (never clean). Download paths must not call this.
 */
export async function scanAttachmentContent(
  input: {
    fileName: string;
    mimeType: string;
    contentHash: string;
    bytes?: Uint8Array;
  },
  deps: ScanAttachmentDeps = {},
): Promise<AvScanOutcome> {
  const env = deps.env ?? process.env;

  if (isClamavEnabled(env)) {
    if (!isClamavHostConfigured(env)) {
      return {
        status: "error",
        engine: "clamav",
        detail: "CLAMAV_HOST_MISSING",
        contentHash: input.contentHash,
      };
    }
    if (!input.bytes || input.bytes.byteLength === 0) {
      return {
        status: "error",
        engine: "clamav",
        detail: "CLAMAV_NO_BYTES",
        contentHash: input.contentHash,
      };
    }
    const { host, port } = clamavHostPort(env);
    const run = deps.instream ?? clamavInstream;
    try {
      const clam = await run(input.bytes, {
        host,
        port,
        timeoutMs: deps.timeoutMs,
      });
      return {
        status: clam.infected ? "blocked" : "clean",
        engine: "clamav",
        detail: clam.detail,
        contentHash: input.contentHash,
      };
    } catch (err: unknown) {
      return {
        status: "error",
        engine: "clamav",
        detail: err instanceof Error ? err.message : "clamav error",
        contentHash: input.contentHash,
      };
    }
  }

  const stub = evaluateQuarantine({
    fileName: input.fileName,
    mimeType: input.mimeType,
    contentHash: input.contentHash,
  });
  return {
    status: stub.status,
    engine: "stub-av",
    detail: stub.detail,
    contentHash: stub.contentHash,
  };
}

/** ClamAV INSTREAM over TCP — ready when daemon + flags are set. */
export function clamavInstream(
  bytes: Uint8Array,
  options?: { host: string; port: number; timeoutMs?: number },
): Promise<{ infected: boolean; detail?: string }> {
  const host = options?.host ?? clamavHostPort().host;
  const port = options?.port ?? clamavHostPort().port;
  const timeoutMs = options?.timeoutMs ?? 15_000;
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("CLAMAV_TIMEOUT"));
    }, timeoutMs);

    socket.on("connect", () => {
      const header = Buffer.from("zINSTREAM\0");
      const size = Buffer.alloc(4);
      size.writeUInt32BE(bytes.byteLength, 0);
      const zero = Buffer.alloc(4);
      socket.write(Buffer.concat([header, size, Buffer.from(bytes), zero]));
    });
    socket.on("data", (d) => chunks.push(Buffer.from(d)));
    socket.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    socket.on("end", () => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (/FOUND/i.test(text) && !/OK/i.test(text)) {
        resolve({ infected: true, detail: text });
        return;
      }
      if (/OK/i.test(text)) {
        resolve({ infected: false, detail: text });
        return;
      }
      reject(new Error(`CLAMAV_UNEXPECTED:${text || "empty"}`));
    });
  });
}
