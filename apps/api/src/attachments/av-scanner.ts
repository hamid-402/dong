import { createConnection } from "node:net";
import { clamavHostPort, isClamavLive } from "@dang/config";
import { evaluateQuarantine, type QuarantineStatus } from "@dang/contracts";

export type AvScanOutcome = {
  status: QuarantineStatus;
  engine: "stub-av" | "clamav";
  detail?: string;
  contentHash: string;
};

/**
 * Prefer ClamAV when CLAMAV_ENABLED=1 + CLAMAV_HOST; otherwise MIME/heuristic stub.
 */
export async function scanAttachmentContent(input: {
  fileName: string;
  mimeType: string;
  contentHash: string;
  bytes?: Uint8Array;
}): Promise<AvScanOutcome> {
  if (isClamavLive() && input.bytes && input.bytes.byteLength > 0) {
    try {
      const clam = await clamavInstream(input.bytes);
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
function clamavInstream(bytes: Uint8Array): Promise<{ infected: boolean; detail?: string }> {
  const { host, port } = clamavHostPort();
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("CLAMAV_TIMEOUT"));
    }, 15_000);

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
