import { createHash, randomBytes } from "node:crypto";

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function issueInviteToken(): string {
  return randomBytes(24).toString("base64url");
}
