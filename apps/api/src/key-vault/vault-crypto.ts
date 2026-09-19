import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export type MasterKeyMaterial = {
  current: Buffer;
  currentVersion: number;
  previous?: Buffer;
  previousVersion?: number;
};

export class VaultCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultCryptoError";
  }
}

/** Decode DANG_MASTER_KEY — must be base64 of exactly 32 bytes. */
export function decodeMasterKeyBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  let buf: Buffer;
  try {
    buf = Buffer.from(trimmed, "base64");
  } catch {
    throw new VaultCryptoError("DANG_MASTER_KEY_INVALID_BASE64");
  }
  if (buf.length !== KEY_LEN) {
    throw new VaultCryptoError("DANG_MASTER_KEY_MUST_BE_32_BYTES");
  }
  return buf;
}

function packAead(iv: Buffer, tag: Buffer, ciphertext: Buffer): string {
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function unpackAead(packed: string): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const buf = Buffer.from(packed, "base64url");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new VaultCryptoError("VAULT_CIPHERTEXT_INVALID");
  }
  return {
    iv: buf.subarray(0, IV_LEN),
    tag: buf.subarray(IV_LEN, IV_LEN + TAG_LEN),
    ciphertext: buf.subarray(IV_LEN + TAG_LEN),
  };
}

function aeadEncrypt(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return packAead(iv, tag, ciphertext);
}

function aeadDecrypt(key: Buffer, packed: string, aad: string): Buffer {
  const { iv, tag, ciphertext } = unpackAead(packed);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/** Payload AAD: secret name + version (R10-06). */
export function payloadAad(name: string, version: number): string {
  return `${name}:${version}`;
}

export function wrapAad(name: string, version: number): string {
  return `wrap:${name}:${version}`;
}

export type EncryptedSecretBlob = {
  ciphertext: string;
  wrappedDek: string;
  masterKeyVersion: number;
};

export function encryptSecret(input: {
  plaintext: string;
  name: string;
  version: number;
  master: MasterKeyMaterial;
}): EncryptedSecretBlob {
  const dek = randomBytes(KEY_LEN);
  const ciphertext = aeadEncrypt(
    dek,
    Buffer.from(input.plaintext, "utf8"),
    payloadAad(input.name, input.version),
  );
  const wrappedDek = aeadEncrypt(
    input.master.current,
    dek,
    wrapAad(input.name, input.version),
  );
  return {
    ciphertext,
    wrappedDek,
    masterKeyVersion: input.master.currentVersion,
  };
}

function unwrapDekWithKey(
  key: Buffer,
  wrappedDek: string,
  name: string,
  version: number,
): Buffer {
  return aeadDecrypt(key, wrappedDek, wrapAad(name, version));
}

export function decryptSecret(input: {
  ciphertext: string;
  wrappedDek: string;
  name: string;
  version: number;
  masterKeyVersion: number;
  master: MasterKeyMaterial;
}): string {
  const keys: Buffer[] = [];
  if (input.masterKeyVersion === input.master.currentVersion) {
    keys.push(input.master.current);
    if (input.master.previous) keys.push(input.master.previous);
  } else if (
    input.master.previous &&
    input.master.previousVersion === input.masterKeyVersion
  ) {
    keys.push(input.master.previous);
    keys.push(input.master.current);
  } else {
    keys.push(input.master.current);
    if (input.master.previous) keys.push(input.master.previous);
  }

  let lastError: unknown;
  for (const key of keys) {
    try {
      const dek = unwrapDekWithKey(key, input.wrappedDek, input.name, input.version);
      const plain = aeadDecrypt(
        dek,
        input.ciphertext,
        payloadAad(input.name, input.version),
      );
      return plain.toString("utf8");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new VaultCryptoError("VAULT_DECRYPT_FAILED");
}

/** Re-wrap DEK under a new master key (same payload ciphertext). */
export function rewrapDek(input: {
  wrappedDek: string;
  name: string;
  version: number;
  from: MasterKeyMaterial;
  to: MasterKeyMaterial;
}): { wrappedDek: string; masterKeyVersion: number } {
  const keys: Buffer[] = [input.from.current];
  if (input.from.previous) keys.push(input.from.previous);
  let dek: Buffer | null = null;
  for (const key of keys) {
    try {
      dek = unwrapDekWithKey(key, input.wrappedDek, input.name, input.version);
      break;
    } catch {
      /* try next */
    }
  }
  if (!dek) throw new VaultCryptoError("VAULT_REWRAP_UNWRAP_FAILED");
  return {
    wrappedDek: aeadEncrypt(input.to.current, dek, wrapAad(input.name, input.version)),
    masterKeyVersion: input.to.currentVersion,
  };
}

export function generateMasterKey(): Buffer {
  return randomBytes(KEY_LEN);
}

export function masterKeysEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Resolve master key: DANG_MASTER_KEY (base64 32B), optional PREVIOUS,
 * or non-prod file `.dang/master.key` (generated once with warning).
 */
export function resolveMasterKeyMaterial(input: {
  env: NodeJS.ProcessEnv;
  cwd?: string;
  warn?: (message: string) => void;
}): MasterKeyMaterial | null {
  const envKey = input.env.DANG_MASTER_KEY?.trim();
  const prevEnv = input.env.DANG_MASTER_KEY_PREVIOUS?.trim();
  const nodeEnv = input.env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";

  if (envKey) {
    const current = decodeMasterKeyBase64(envKey);
    const material: MasterKeyMaterial = { current, currentVersion: 1 };
    if (prevEnv) {
      const previous = decodeMasterKeyBase64(prevEnv);
      if (!masterKeysEqual(previous, current)) {
        material.previous = previous;
        material.previousVersion = 0;
      }
    }
    return material;
  }

  if (isProd) {
    return null;
  }

  const root = input.cwd ?? process.cwd();
  const path = join(root, ".dang", "master.key");
  if (existsSync(path)) {
    const raw = readFileSync(path, "utf8").trim();
    const current = decodeMasterKeyBase64(raw);
    return { current, currentVersion: 1 };
  }

  const generated = generateMasterKey();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, generated.toString("base64"), { encoding: "utf8", mode: 0o600 });
  input.warn?.(
    `DANG_MASTER_KEY unset — generated local vault master key at ${path} (non-prod only; do not commit)`,
  );
  return { current: generated, currentVersion: 1 };
}

/** Persist rotated master to file when using file-backed non-prod key. */
export function persistMasterKeyFile(cwd: string, key: Buffer): string {
  const path = join(cwd, ".dang", "master.key");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return path;
}
