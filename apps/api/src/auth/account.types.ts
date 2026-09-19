import type {
  AuthActor,
  DisplayUnitPreference,
  PlatformRole,
  UpdateProfileRequest,
  UserProfile,
} from "@dang/contracts";

export type AccountRecord = {
  userId: string;
  externalSubject: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  displayName: string;
  passwordHash: string | null;
  avatarUrl: string | null;
  locale: string;
  timezone: string;
  username: string | null;
  phone: string | null;
  phoneHash: string | null;
  phoneVerifiedAt: Date | null;
  platformRole: PlatformRole;
  displayUnit: DisplayUnitPreference | null;
  usernameChangedAt: Date | null;
  /** Platform disable (S11-13); null = active. */
  disabledAt: Date | null;
  disabledByUserId: string | null;
  disabledReason: string | null;
  /** Base32 TOTP secret; null when MFA never set up. */
  totpSecret: string | null;
  totpEnabledAt: Date | null;
  createdAt: Date;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
};

export type PasswordResetRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type EmailVerifyRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type MfaRecoveryRecord = {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
};

export type CreateLocalUserInput = {
  email: string;
  displayName: string;
  passwordHash: string;
  username: string;
  phone?: string | null;
  phoneHash?: string | null;
};

export type AccountStore = {
  readonly persistence: "memory" | "postgres";
  findByEmail(email: string): Promise<AccountRecord | null>;
  findById(userId: string): Promise<AccountRecord | null>;
  findByExternalSubject(externalSubject: string): Promise<AccountRecord | null>;
  findByUsername(username: string): Promise<AccountRecord | null>;
  findByPhone(phoneE164: string): Promise<AccountRecord | null>;
  findByPhoneHash(phoneHash: string): Promise<AccountRecord | null>;
  createLocalUser(input: CreateLocalUserInput): Promise<AccountRecord>;
  findOrCreateOidcUser(input: {
    externalSubject: string;
    email?: string;
    displayName: string;
  }): Promise<AccountRecord>;
  updateProfile(userId: string, patch: UpdateProfileRequest): Promise<AccountRecord>;
  /**
   * Apply identity fields that need uniqueness checks / hash side-effects.
   * `phoneHash` is computed by the service; pass null with phone null to clear.
   */
  setIdentityFields(
    userId: string,
    patch: {
      username?: string;
      phone?: string | null;
      phoneHash?: string | null;
      displayUnit?: DisplayUnitPreference | null;
      usernameChangedAt?: Date | null;
    },
  ): Promise<AccountRecord>;
  changeEmail(
    userId: string,
    newEmail: string,
  ): Promise<AccountRecord>;
  setPasswordHash(userId: string, passwordHash: string): Promise<void>;
  markEmailVerified(userId: string): Promise<AccountRecord>;
  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  listActiveSessions(userId: string): Promise<SessionRecord[]>;
  revokeSession(sessionId: string): Promise<void>;
  revokeSessionForUser(sessionId: string, userId: string): Promise<boolean>;
  revokeAllSessions(userId: string): Promise<void>;
  createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord>;
  findPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null>;
  markPasswordResetUsed(id: string): Promise<void>;
  createEmailVerification(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerifyRecord>;
  findEmailVerificationByTokenHash(tokenHash: string): Promise<EmailVerifyRecord | null>;
  markEmailVerificationUsed(id: string): Promise<void>;
  /** Persist pending TOTP secret (enabled_at stays null until confirm). */
  setTotpSecret(userId: string, secret: string): Promise<AccountRecord>;
  enableTotp(userId: string): Promise<AccountRecord>;
  disableTotp(userId: string): Promise<AccountRecord>;
  replaceMfaRecoveryCodes(userId: string, codeHashes: string[]): Promise<void>;
  listUnusedMfaRecovery(userId: string): Promise<MfaRecoveryRecord[]>;
  markMfaRecoveryUsed(id: string): Promise<void>;
  /**
   * GDPR-like anonymization (R10-14): wipe PII, credentials, MFA; keep userId for ledger FKs.
   */
  anonymizeAccount(userId: string): Promise<AccountRecord>;
  /** Platform console user search (S11-13). Cursor is opaque offset string. */
  searchUsers(input: {
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: AccountRecord[]; nextCursor?: string }>;
  setPlatformRole(userId: string, platformRole: PlatformRole): Promise<AccountRecord>;
  setDisabled(
    userId: string,
    patch: {
      disabledAt: Date | null;
      disabledByUserId: string | null;
      disabledReason: string | null;
    },
  ): Promise<AccountRecord>;
  countActivePlatformOwners(): Promise<number>;
};

export const ACCOUNT_STORE = Symbol("ACCOUNT_STORE");

export { API_SESSION_COOKIE as SESSION_COOKIE } from "@dang/contracts";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function asPlatformRole(raw: string | null | undefined): PlatformRole {
  if (raw === "platform_owner" || raw === "platform_support") return raw;
  return "user";
}

function asDisplayUnit(raw: string | null | undefined): DisplayUnitPreference | null {
  if (raw === "rial" || raw === "toman") return raw;
  return null;
}

export function authModeForUser(row: AccountRecord): AuthActor["authMode"] {
  if (row.externalSubject.startsWith("local:")) return "password";
  return row.passwordHash ? "password" : "oidc";
}

export function toProfile(
  row: AccountRecord,
  authMode: AuthActor["authMode"],
  opts?: { mfaEnrollmentRequired?: boolean },
): UserProfile {
  const mfaEnabled = Boolean(row.totpEnabledAt);
  return {
    userId: row.userId,
    email: row.email ?? undefined,
    emailVerified: Boolean(row.emailVerifiedAt),
    username: row.username ?? undefined,
    phone: row.phone ?? undefined,
    phoneVerified: Boolean(row.phoneVerifiedAt),
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? undefined,
    locale: row.locale || "fa-IR",
    timezone: row.timezone || "Asia/Tehran",
    displayUnit: row.displayUnit,
    platformRole: asPlatformRole(row.platformRole),
    authMode,
    hasPassword: Boolean(row.passwordHash),
    mfaEnabled,
    ...(opts?.mfaEnrollmentRequired && !mfaEnabled
      ? { mfaEnrollmentRequired: true }
      : {}),
    ...(!row.username ? { usernameRequired: true } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toActor(row: AccountRecord, authMode: AuthActor["authMode"]): AuthActor {
  return {
    userId: row.userId,
    externalSubject: row.externalSubject,
    displayName: row.displayName,
    authMode,
  };
}

export { asDisplayUnit, asPlatformRole };
