import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import { loadAppEnv } from "@dang/config";

export type AttachmentBlobMode = "local" | "none";

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
    return join(this.rootDir, workspaceId, attachmentId);
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
    } catch {
      return null;
    }
  }
}
