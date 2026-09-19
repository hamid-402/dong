import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** Stored ciphertext prefix — legacy base32 rows have no prefix. */
export const TOTP_SECRET_PREFIX = "enc:v1:";

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function decodeKeyMaterial(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const b64 = Buffer.from(trimmed, "base64");
    if (b64.length === KEY_LEN) return b64;
  } catch {
    /* fall through */
  }
  return Buffer.from(hkdfSync("sha256", trimmed, "dang-totp", "totp-secret-v1", KEY_LEN));
}

/** Resolve AES key from TOTP_ENCRYPTION_KEY or SESSION_SECRET. */
export function resolveTotpEncryptionKey(env: {
  TOTP_ENCRYPTION_KEY?: string;
  SESSION_SECRET?: string;
}): Buffer {
  const dedicated = env.TOTP_ENCRYPTION_KEY?.trim();
  if (dedicated) return decodeKeyMaterial(dedicated);
  const session = env.SESSION_SECRET?.trim();
  if (session) return decodeKeyMaterial(session);
  return decodeKeyMaterial("dang-dev-totp-fallback-not-for-prod");
}

/** Current + optional previous key for decrypt during rotation (R10-06). */
export function resolveTotpEncryptionKeyring(env: {
  TOTP_ENCRYPTION_KEY?: string;
  TOTP_ENCRYPTION_KEY_PREVIOUS?: string;
  SESSION_SECRET?: string;
}): { current: Buffer; previous?: Buffer } {
  const current = resolveTotpEncryptionKey(env);
  const prevRaw = env.TOTP_ENCRYPTION_KEY_PREVIOUS?.trim();
  if (!prevRaw) return { current };
  const previous = decodeKeyMaterial(prevRaw);
  if (previous.equals(current)) return { current };
  return { current, previous };
}

export function sealTotpSecret(plainBase32: string, key: Buffer): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainBase32, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return `${TOTP_SECRET_PREFIX}${packed.toString("base64url")}`;
}

export function openTotpSecret(stored: string, key: Buffer): string {
  const value = stored.trim();
  if (!value.startsWith(TOTP_SECRET_PREFIX)) {
    return value;
  }
  const packed = Buffer.from(value.slice(TOTP_SECRET_PREFIX.length), "base64url");
  if (packed.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("TOTP_CIPHERTEXT_INVALID");
  }
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Decrypt with current key, then previous (rotation window). */
export function openTotpSecretWithKeyring(
  stored: string,
  keyring: { current: Buffer; previous?: Buffer },
): string {
  const value = stored.trim();
  if (!value.startsWith(TOTP_SECRET_PREFIX)) {
    return value;
  }
  try {
    return openTotpSecret(value, keyring.current);
  } catch (first) {
    if (!keyring.previous) throw first;
    return openTotpSecret(value, keyring.previous);
  }
}

export function isSealedTotpSecret(stored: string): boolean {
  return stored.trim().startsWith(TOTP_SECRET_PREFIX);
}
