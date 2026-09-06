import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/** OWASP-ish Argon2id parameters for interactive login. */
const ARGON2_OPTS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19_456,
  hashLength: 32,
} as const;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLen: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLen, options, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

async function verifyScryptLegacy(
  password: string,
  encoded: string,
): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const expected = Buffer.from(parts[5] ?? "", "base64url");
  if (!salt.length || !expected.length || !n || !r || !p) return false;
  const derived = await scryptAsync(password, salt, expected.length, {
    N: n,
    r,
    p,
  });
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/** New hashes use Argon2id (PHC encoded); legacy scrypt$… remains verifiable until login rehash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2id({
    password,
    salt,
    ...ARGON2_OPTS,
    outputType: "encoded",
  });
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (encoded.startsWith("$argon2id$") || encoded.startsWith("$argon2")) {
    try {
      const valid = await argon2Verify({ password, hash: encoded });
      return { valid, needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }
  const valid = await verifyScryptLegacy(password, encoded);
  return { valid, needsRehash: valid };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < 10) throw new Error("PASSWORD_TOO_SHORT");
  if (password.length > 128) throw new Error("PASSWORD_TOO_LONG");
  if (!/\p{L}/u.test(password) || !/\p{N}/u.test(password)) {
    throw new Error("PASSWORD_WEAK");
  }
}

export function assertEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw new Error("EMAIL_INVALID");
  }
  return normalized;
}
