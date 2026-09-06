import type { UpdateProfileRequest } from "@dang/contracts";
import type {
  AccountRecord,
  AccountStore,
  EmailVerifyRecord,
  PasswordResetRecord,
  SessionRecord,
} from "./account.types.js";

type MemoryUser = AccountRecord;
type MemorySession = SessionRecord & {
  ip?: string;
  userAgent?: string;
};

export class MemoryAccountStore implements AccountStore {
  readonly persistence = "memory" as const;
  private readonly users = new Map<string, MemoryUser>();
  private readonly byEmail = new Map<string, string>();
  private readonly bySubject = new Map<string, string>();
  private readonly sessions = new Map<string, MemorySession>();
  private readonly resets = new Map<string, PasswordResetRecord>();
  private readonly verifications = new Map<string, EmailVerifyRecord>();

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

  createLocalUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<AccountRecord> {
    const email = input.email.toLowerCase();
    if (this.byEmail.has(email)) throw new Error("EMAIL_TAKEN");
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
      createdAt: new Date(),
    };
    this.users.set(userId, row);
    this.byEmail.set(email, userId);
    this.bySubject.set(row.externalSubject, userId);
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

  revokeSession(sessionId: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.id === sessionId) session.revokedAt = new Date();
    }
    return Promise.resolve();
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
}
