import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Injectable } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";

export type AttachmentBlobMode = "local" | "none";

/** UUID / opaque id segment — reject path escape attempts. */
function assertSafeBlobSegment(value: string, label: string): void {
  const v = value.trim();
  if (
    !v ||
    v.includes("..") ||
    v.includes("/") ||
    v.includes("\\") ||
    v.includes("\0") ||
    v.includes(sep)
  ) {
    throw new Error(`ATTACHMENT_PATH:${label}`);
  }
}

@Injectable()
export class AttachmentBlobService {
  private readonly rootDir: string;

  constructor() {
    const env = loadAppEnv();
    this.rootDir = env.attachmentBlobDir
      ? resolve(env.attachmentBlobDir)
      : resolve(process.cwd(), ".data/attachment-blobs");
  }

  mode(): AttachmentBlobMode {
    return "local";
  }

  rootPath(): string {
    return this.rootDir;
  }

  objectPath(workspaceId: string, attachmentId: string): string {
    assertSafeBlobSegment(workspaceId, "workspaceId");
    assertSafeBlobSegment(attachmentId, "attachmentId");
    const path = resolve(join(this.rootDir, workspaceId, attachmentId));
    const root = this.rootDir.endsWith(sep) ? this.rootDir : `${this.rootDir}${sep}`;
    if (path !== this.rootDir && !path.startsWith(root)) {
      throw new Error("ATTACHMENT_PATH:escape");
    }
    return path;
  }

  hashBuffer(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
  }

  async write(workspaceId: string, attachmentId: string, buffer: Buffer): Promise<string> {
    const path = this.objectPath(workspaceId, attachmentId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buffer);
    return path;
  }

  async read(workspaceId: string, attachmentId: string): Promise<Buffer | null> {
    try {
      return await readFile(this.objectPath(workspaceId, attachmentId));
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith("ATTACHMENT_PATH")) {
        throw error;
      }
      return null;
    }
  }
}
