import type { AuthActor, UpdateProfileRequest, UserProfile } from "@dang/contracts";

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

export type AccountStore = {
  readonly persistence: "memory" | "postgres";
  findByEmail(email: string): Promise<AccountRecord | null>;
  findById(userId: string): Promise<AccountRecord | null>;
  findByExternalSubject(externalSubject: string): Promise<AccountRecord | null>;
  createLocalUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<AccountRecord>;
  findOrCreateOidcUser(input: {
    externalSubject: string;
    email?: string;
    displayName: string;
  }): Promise<AccountRecord>;
  updateProfile(userId: string, patch: UpdateProfileRequest): Promise<AccountRecord>;
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
  revokeSession(sessionId: string): Promise<void>;
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
};

export const ACCOUNT_STORE = Symbol("ACCOUNT_STORE");

export const SESSION_COOKIE = "dang_session";
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
export const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1000;

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
    displayName: row.displayName,
    avatarUrl: row.avatarUrl ?? undefined,
    locale: row.locale || "fa-IR",
    timezone: row.timezone || "Asia/Tehran",
    authMode,
    hasPassword: Boolean(row.passwordHash),
    mfaEnabled,
    ...(opts?.mfaEnrollmentRequired && !mfaEnabled
      ? { mfaEnrollmentRequired: true }
      : {}),
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
