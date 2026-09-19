import type { DisplayUnitPreference, PlatformRole, UpdateProfileRequest } from "@dang/contracts";
import type {
  AccountRecord,
  AccountStore,
  CreateLocalUserInput,
  EmailVerifyRecord,
  MfaRecoveryRecord,
  PasswordResetRecord,
  SessionRecord,
} from "./account.types.js";

type MemoryUser = AccountRecord;
type MemorySession = SessionRecord & {
  ip?: string;
  userAgent?: string;
};

function blankIdentity(): Pick<
  AccountRecord,
  | "username"
  | "phone"
  | "phoneHash"
  | "phoneVerifiedAt"
  | "platformRole"
  | "displayUnit"
  | "usernameChangedAt"
  | "disabledAt"
  | "disabledByUserId"
  | "disabledReason"
> {
  return {
    username: null,
    phone: null,
    phoneHash: null,
    phoneVerifiedAt: null,
    platformRole: "user",
    displayUnit: null,
    usernameChangedAt: null,
    disabledAt: null,
    disabledByUserId: null,
    disabledReason: null,
  };
}

export class MemoryAccountStore implements AccountStore {
  readonly persistence = "memory" as const;
  private readonly users = new Map<string, MemoryUser>();
  private readonly byEmail = new Map<string, string>();
  private readonly bySubject = new Map<string, string>();
  private readonly byUsername = new Map<string, string>();
  private readonly byPhone = new Map<string, string>();
  private readonly sessions = new Map<string, MemorySession>();
  private readonly resets = new Map<string, PasswordResetRecord>();
  private readonly verifications = new Map<string, EmailVerifyRecord>();
  private readonly mfaRecovery = new Map<string, MfaRecoveryRecord>();

  findByEmail(email: string): Promise<AccountRecord | null> {
    const id = this.byEmail.get(email.toLowerCase());
    return Promise.resolve(id ? (this.users.get(id) ?? null) : null);
  }

  findById(userId: string): Promise<AccountRecord | null> {
    return Promise.resolve(this.users.get(userId) ?? null);
  }

  findByExternalSubject(externalSubject: string): Promise<AccountRecord | null> {
    const id = this.bySubject.get(externalSubject);
    return Promise.resolve(id ? (this.users.get(id) ?? null) : null);
  }

  findByUsername(username: string): Promise<AccountRecord | null> {
    const id = this.byUsername.get(username.toLowerCase());
    return Promise.resolve(id ? (this.users.get(id) ?? null) : null);
  }

  findByPhone(phoneE164: string): Promise<AccountRecord | null> {
    const id = this.byPhone.get(phoneE164);
    return Promise.resolve(id ? (this.users.get(id) ?? null) : null);
  }

  findByPhoneHash(phoneHash: string): Promise<AccountRecord | null> {
    for (const row of this.users.values()) {
      if (row.phoneHash === phoneHash) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  createLocalUser(input: CreateLocalUserInput): Promise<AccountRecord> {
    const email = input.email.toLowerCase();
    const username = input.username.toLowerCase();
    if (this.byEmail.has(email)) throw new Error("EMAIL_TAKEN");
    if (this.byUsername.has(username)) throw new Error("USERNAME_TAKEN");
    if (input.phone && this.byPhone.has(input.phone)) throw new Error("PHONE_TAKEN");
    const userId = crypto.randomUUID();
    const row: MemoryUser = {
      userId,
      externalSubject: `local:${email}`,
      email,
      emailVerifiedAt: null,
      displayName: input.displayName.trim(),
      passwordHash: input.passwordHash,
      avatarUrl: null,
      locale: "fa-IR",
      timezone: "Asia/Tehran",
      ...blankIdentity(),
      username,
      phone: input.phone ?? null,
      phoneHash: input.phoneHash ?? null,
      usernameChangedAt: new Date(),
      totpSecret: null,
      totpEnabledAt: null,
      createdAt: new Date(),
    };
    this.users.set(userId, row);
    this.byEmail.set(email, userId);
    this.bySubject.set(row.externalSubject, userId);
    this.byUsername.set(username, userId);
    if (row.phone) this.byPhone.set(row.phone, userId);
    return Promise.resolve(row);
  }

  findOrCreateOidcUser(input: {
    externalSubject: string;
    email?: string;
    displayName: string;
  }): Promise<AccountRecord> {
    const existing = this.bySubject.get(input.externalSubject);
    if (existing) {
      const row = this.users.get(existing)!;
      row.displayName = input.displayName.trim() || row.displayName;
      if (input.email) {
        row.email = input.email.toLowerCase();
        row.emailVerifiedAt = new Date();
        this.byEmail.set(row.email, row.userId);
      }
      return Promise.resolve(row);
    }
    const userId = crypto.randomUUID();
    const row: MemoryUser = {
      userId,
      externalSubject: input.externalSubject,
      email: input.email?.toLowerCase() ?? null,
      emailVerifiedAt: input.email ? new Date() : null,
      displayName: input.displayName.trim() || "کاربر OIDC",
      passwordHash: null,
      avatarUrl: null,
      locale: "fa-IR",
      timezone: "Asia/Tehran",
      ...blankIdentity(),
      totpSecret: null,
      totpEnabledAt: null,
      createdAt: new Date(),
    };
    this.users.set(userId, row);
    this.bySubject.set(input.externalSubject, userId);
    if (row.email) this.byEmail.set(row.email, userId);
    return Promise.resolve(row);
  }

  updateProfile(userId: string, patch: UpdateProfileRequest): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    if (patch.displayName !== undefined) row.displayName = patch.displayName.trim();
    if (patch.locale !== undefined) row.locale = patch.locale;
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    if (patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl;
    return Promise.resolve(row);
  }

  setIdentityFields(
    userId: string,
    patch: {
      username?: string;
      phone?: string | null;
      phoneHash?: string | null;
      displayUnit?: DisplayUnitPreference | null;
      usernameChangedAt?: Date | null;
    },
  ): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    if (patch.username !== undefined) {
      const next = patch.username.toLowerCase();
      const owner = this.byUsername.get(next);
      if (owner && owner !== userId) throw new Error("USERNAME_TAKEN");
      if (row.username) this.byUsername.delete(row.username);
      row.username = next;
      this.byUsername.set(next, userId);
      row.usernameChangedAt = patch.usernameChangedAt ?? new Date();
    }
    if (patch.phone !== undefined) {
      if (patch.phone) {
        const owner = this.byPhone.get(patch.phone);
        if (owner && owner !== userId) throw new Error("PHONE_TAKEN");
        if (row.phone) this.byPhone.delete(row.phone);
        row.phone = patch.phone;
        row.phoneHash = patch.phoneHash ?? null;
        row.phoneVerifiedAt = null;
        this.byPhone.set(patch.phone, userId);
      } else {
        if (row.phone) this.byPhone.delete(row.phone);
        row.phone = null;
        row.phoneHash = null;
        row.phoneVerifiedAt = null;
      }
    }
    if (patch.displayUnit !== undefined) {
      row.displayUnit = patch.displayUnit;
    }
    return Promise.resolve(row);
  }

  changeEmail(userId: string, newEmail: string): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    const email = newEmail.toLowerCase();
    const owner = this.byEmail.get(email);
    if (owner && owner !== userId) throw new Error("EMAIL_TAKEN");
    if (row.email) this.byEmail.delete(row.email.toLowerCase());
    row.email = email;
    row.emailVerifiedAt = null;
    row.externalSubject = `local:${email}`;
    this.byEmail.set(email, userId);
    this.bySubject.set(row.externalSubject, userId);
    return Promise.resolve(row);
  }

  setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    row.passwordHash = passwordHash;
    return Promise.resolve();
  }

  markEmailVerified(userId: string): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    row.emailVerifiedAt = new Date();
    return Promise.resolve(row);
  }

  createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<SessionRecord> {
    const session: MemorySession = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      ip: input.ip,
      userAgent: input.userAgent,
      createdAt: new Date(),
    };
    this.sessions.set(session.tokenHash, session);
    return Promise.resolve(session);
  }

  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt) return Promise.resolve(null);
    if (session.expiresAt.getTime() <= Date.now()) return Promise.resolve(null);
    return Promise.resolve(session);
  }

  listActiveSessions(userId: string): Promise<SessionRecord[]> {
    const now = Date.now();
    return Promise.resolve(
      [...this.sessions.values()]
        .filter(
          (session) =>
            session.userId === userId &&
            !session.revokedAt &&
            session.expiresAt.getTime() > now,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  revokeSession(sessionId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) session.revokedAt = new Date();
    }
    return Promise.resolve();
  }

  revokeSessionForUser(sessionId: string, userId: string): Promise<boolean> {
    for (const session of this.sessions.values()) {
      if (session.id !== sessionId || session.userId !== userId || session.revokedAt) {
        continue;
      }
      session.revokedAt = new Date();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  revokeAllSessions(userId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId) session.revokedAt = new Date();
    }
    return Promise.resolve();
  }

  createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord> {
    const row: PasswordResetRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
    };
    this.resets.set(row.tokenHash, row);
    return Promise.resolve(row);
  }

  findPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    const row = this.resets.get(tokenHash);
    if (!row || row.usedAt) return Promise.resolve(null);
    if (row.expiresAt.getTime() <= Date.now()) return Promise.resolve(null);
    return Promise.resolve(row);
  }

  markPasswordResetUsed(id: string): Promise<void> {
    for (const row of this.resets.values()) {
      if (row.id === id) row.usedAt = new Date();
    }
    return Promise.resolve();
  }

  createEmailVerification(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerifyRecord> {
    const row: EmailVerifyRecord = {
      id: crypto.randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
    };
    this.verifications.set(row.tokenHash, row);
    return Promise.resolve(row);
  }

  findEmailVerificationByTokenHash(tokenHash: string): Promise<EmailVerifyRecord | null> {
    const row = this.verifications.get(tokenHash);
    if (!row || row.usedAt) return Promise.resolve(null);
    if (row.expiresAt.getTime() <= Date.now()) return Promise.resolve(null);
    return Promise.resolve(row);
  }

  markEmailVerificationUsed(id: string): Promise<void> {
    for (const row of this.verifications.values()) {
      if (row.id === id) row.usedAt = new Date();
    }
    return Promise.resolve();
  }

  setTotpSecret(userId: string, secret: string): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    row.totpSecret = secret;
    row.totpEnabledAt = null;
    return Promise.resolve(row);
  }

  enableTotp(userId: string): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    if (!row.totpSecret) throw new Error("MFA_NOT_SETUP");
    row.totpEnabledAt = new Date();
    return Promise.resolve(row);
  }

  disableTotp(userId: string): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    row.totpSecret = null;
    row.totpEnabledAt = null;
    for (const [key, rec] of this.mfaRecovery) {
      if (rec.userId === userId) this.mfaRecovery.delete(key);
    }
    return Promise.resolve(row);
  }

  replaceMfaRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    for (const [key, rec] of this.mfaRecovery) {
      if (rec.userId === userId) this.mfaRecovery.delete(key);
    }
    for (const codeHash of codeHashes) {
      const row: MfaRecoveryRecord = {
        id: crypto.randomUUID(),
        userId,
        codeHash,
        usedAt: null,
        createdAt: new Date(),
      };
      this.mfaRecovery.set(row.id, row);
    }
    return Promise.resolve();
  }

  listUnusedMfaRecovery(userId: string): Promise<MfaRecoveryRecord[]> {
    const rows: MfaRecoveryRecord[] = [];
    for (const rec of this.mfaRecovery.values()) {
      if (rec.userId === userId && !rec.usedAt) rows.push(rec);
    }
    return Promise.resolve(rows);
  }

  markMfaRecoveryUsed(id: string): Promise<void> {
    const row = this.mfaRecovery.get(id);
    if (row) row.usedAt = new Date();
    return Promise.resolve();
  }

  anonymizeAccount(userId: string): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    if (row.email) this.byEmail.delete(row.email.toLowerCase());
    if (row.username) this.byUsername.delete(row.username);
    if (row.phone) this.byPhone.delete(row.phone);
    this.bySubject.delete(row.externalSubject);
    const tombstoneEmail = `deleted+${userId}@invalid.local`;
    const tombstoneSubject = `deleted:${userId}`;
    row.email = tombstoneEmail;
    row.emailVerifiedAt = null;
    row.displayName = "حساب حذف‌شده";
    row.avatarUrl = null;
    row.passwordHash = null;
    row.totpSecret = null;
    row.totpEnabledAt = null;
    row.username = null;
    row.phone = null;
    row.phoneHash = null;
    row.phoneVerifiedAt = null;
    row.displayUnit = null;
    row.usernameChangedAt = null;
    row.externalSubject = tombstoneSubject;
    this.byEmail.set(tombstoneEmail, userId);
    this.bySubject.set(tombstoneSubject, userId);
    for (const [key, rec] of this.mfaRecovery) {
      if (rec.userId === userId) this.mfaRecovery.delete(key);
    }
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        session.revokedAt = new Date();
      }
    }
    return Promise.resolve(row);
  }

  searchUsers(input: {
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: AccountRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const offset = Math.max(Number.parseInt(input.cursor ?? "0", 10) || 0, 0);
    const q = (input.q ?? "").trim().toLowerCase();
    let rows = [...this.users.values()].sort((a, b) =>
      a.createdAt.getTime() === b.createdAt.getTime()
        ? a.userId.localeCompare(b.userId)
        : b.createdAt.getTime() - a.createdAt.getTime(),
    );
    if (q) {
      rows = rows.filter(
        (u) =>
          (u.email ?? "").toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          u.userId.toLowerCase() === q,
      );
    }
    const slice = rows.slice(offset, offset + limit);
    const next = offset + slice.length;
    return Promise.resolve({
      items: slice,
      nextCursor: next < rows.length ? String(next) : undefined,
    });
  }

  setPlatformRole(userId: string, platformRole: PlatformRole): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    row.platformRole = platformRole;
    return Promise.resolve(row);
  }

  setDisabled(
    userId: string,
    patch: {
      disabledAt: Date | null;
      disabledByUserId: string | null;
      disabledReason: string | null;
    },
  ): Promise<AccountRecord> {
    const row = this.users.get(userId);
    if (!row) throw new Error("USER_NOT_FOUND");
    row.disabledAt = patch.disabledAt;
    row.disabledByUserId = patch.disabledByUserId;
    row.disabledReason = patch.disabledReason;
    if (patch.disabledAt) {
      for (const session of this.sessions.values()) {
        if (session.userId === userId && !session.revokedAt) {
          session.revokedAt = new Date();
        }
      }
    }
    return Promise.resolve(row);
  }

  countActivePlatformOwners(): Promise<number> {
    let n = 0;
    for (const u of this.users.values()) {
      if (u.platformRole === "platform_owner" && !u.disabledAt) n += 1;
    }
    return Promise.resolve(n);
  }
}
