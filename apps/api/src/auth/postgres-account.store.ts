import {
  and,
  authEmailVerify,
  authMfaRecovery,
  authPasswordReset,
  authSession,
  createDatabase,
  eq,
  isNull,
  sql,
  userAccount,
  type AppDatabase,
} from "@dang/db";
import type { UpdateProfileRequest } from "@dang/contracts";
import type {
  AccountRecord,
  AccountStore,
  EmailVerifyRecord,
  MfaRecoveryRecord,
  PasswordResetRecord,
  SessionRecord,
} from "./account.types.js";

function mapUser(row: typeof userAccount.$inferSelect): AccountRecord {
  return {
    userId: row.id,
    externalSubject: row.externalSubject,
    email: row.email ?? null,
    emailVerifiedAt: row.emailVerifiedAt ?? null,
    displayName: row.displayName,
    passwordHash: row.passwordHash ?? null,
    avatarUrl: row.avatarUrl ?? null,
    locale: row.locale ?? "fa-IR",
    timezone: row.timezone ?? "Asia/Tehran",
    totpSecret: row.totpSecret ?? null,
    totpEnabledAt: row.totpEnabledAt ?? null,
    createdAt: row.createdAt,
  };
}

export class PostgresAccountStore implements AccountStore {
  readonly persistence = "postgres" as const;

  constructor(private readonly db: AppDatabase) {}

  static fromConnectionString(connectionString: string): PostgresAccountStore {
    const { db } = createDatabase(connectionString);
    return new PostgresAccountStore(db);
  }

  async findByEmail(email: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select()
      .from(userAccount)
      .where(sql`lower(${userAccount.email}) = ${email.toLowerCase()}`)
      .limit(1);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findById(userId: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select()
      .from(userAccount)
      .where(eq(userAccount.id, userId))
      .limit(1);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByExternalSubject(externalSubject: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select()
      .from(userAccount)
      .where(eq(userAccount.externalSubject, externalSubject))
      .limit(1);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createLocalUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<AccountRecord> {
    const email = input.email.toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) throw new Error("EMAIL_TAKEN");
    const inserted = await this.db
      .insert(userAccount)
      .values({
        externalSubject: `local:${email}`,
        displayName: input.displayName.trim(),
        email,
        passwordHash: input.passwordHash,
        locale: "fa-IR",
        timezone: "Asia/Tehran",
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("USER_CREATE_FAILED");
    return mapUser(row);
  }

  async findOrCreateOidcUser(input: {
    externalSubject: string;
    email?: string;
    displayName: string;
  }): Promise<AccountRecord> {
    const existing = await this.findByExternalSubject(input.externalSubject);
    if (existing) {
      const updated = await this.db
        .update(userAccount)
        .set({
          displayName: input.displayName.trim() || existing.displayName,
          email: input.email?.toLowerCase() ?? existing.email,
          emailVerifiedAt: input.email ? new Date() : existing.emailVerifiedAt,
          updatedAt: new Date(),
        })
        .where(eq(userAccount.id, existing.userId))
        .returning();
      return updated[0] ? mapUser(updated[0]) : existing;
    }
    const inserted = await this.db
      .insert(userAccount)
      .values({
        externalSubject: input.externalSubject,
        displayName: input.displayName.trim() || "کاربر OIDC",
        email: input.email?.toLowerCase(),
        emailVerifiedAt: input.email ? new Date() : null,
        locale: "fa-IR",
        timezone: "Asia/Tehran",
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("USER_CREATE_FAILED");
    return mapUser(row);
  }

  async updateProfile(userId: string, patch: UpdateProfileRequest): Promise<AccountRecord> {
    const updates: Partial<typeof userAccount.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (patch.displayName !== undefined) updates.displayName = patch.displayName.trim();
    if (patch.locale !== undefined) updates.locale = patch.locale;
    if (patch.timezone !== undefined) updates.timezone = patch.timezone;
    if (patch.avatarUrl !== undefined) updates.avatarUrl = patch.avatarUrl;
    const updated = await this.db
      .update(userAccount)
      .set(updates)
      .where(eq(userAccount.id, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return mapUser(row);
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    const updated = await this.db
      .update(userAccount)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(userAccount.id, userId))
      .returning({ id: userAccount.id });
    if (!updated[0]) throw new Error("USER_NOT_FOUND");
  }

  async markEmailVerified(userId: string): Promise<AccountRecord> {
    const updated = await this.db
      .update(userAccount)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(userAccount.id, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return mapUser(row);
  }

  async createSession(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<SessionRecord> {
    const inserted = await this.db
      .insert(authSession)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        ip: input.ip,
        userAgent: input.userAgent,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("SESSION_CREATE_FAILED");
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt ?? null,
    };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(authSession)
      .where(
        and(
          eq(authSession.tokenHash, tokenHash),
          isNull(authSession.revokedAt),
          sql`${authSession.expiresAt} > now()`,
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt ?? null,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .update(authSession)
      .set({ revokedAt: new Date() })
      .where(eq(authSession.id, sessionId));
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.db
      .update(authSession)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSession.userId, userId), isNull(authSession.revokedAt)));
  }

  async createPasswordReset(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<PasswordResetRecord> {
    const inserted = await this.db
      .insert(authPasswordReset)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("RESET_CREATE_FAILED");
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt ?? null,
    };
  }

  async findPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetRecord | null> {
    const rows = await this.db
      .select()
      .from(authPasswordReset)
      .where(
        and(
          eq(authPasswordReset.tokenHash, tokenHash),
          isNull(authPasswordReset.usedAt),
          sql`${authPasswordReset.expiresAt} > now()`,
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt ?? null,
    };
  }

  async markPasswordResetUsed(id: string): Promise<void> {
    await this.db
      .update(authPasswordReset)
      .set({ usedAt: new Date() })
      .where(eq(authPasswordReset.id, id));
  }

  async createEmailVerification(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<EmailVerifyRecord> {
    const inserted = await this.db
      .insert(authEmailVerify)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error("VERIFY_CREATE_FAILED");
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt ?? null,
    };
  }

  async findEmailVerificationByTokenHash(
    tokenHash: string,
  ): Promise<EmailVerifyRecord | null> {
    const rows = await this.db
      .select()
      .from(authEmailVerify)
      .where(
        and(
          eq(authEmailVerify.tokenHash, tokenHash),
          isNull(authEmailVerify.usedAt),
          sql`${authEmailVerify.expiresAt} > now()`,
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      usedAt: row.usedAt ?? null,
    };
  }

  async markEmailVerificationUsed(id: string): Promise<void> {
    await this.db
      .update(authEmailVerify)
      .set({ usedAt: new Date() })
      .where(eq(authEmailVerify.id, id));
  }

  async setTotpSecret(userId: string, secret: string): Promise<AccountRecord> {
    const updated = await this.db
      .update(userAccount)
      .set({
        totpSecret: secret,
        totpEnabledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userAccount.id, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return mapUser(row);
  }

  async enableTotp(userId: string): Promise<AccountRecord> {
    const updated = await this.db
      .update(userAccount)
      .set({
        totpEnabledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(userAccount.id, userId), sql`${userAccount.totpSecret} is not null`))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("MFA_NOT_SETUP");
    return mapUser(row);
  }

  async disableTotp(userId: string): Promise<AccountRecord> {
    await this.db.delete(authMfaRecovery).where(eq(authMfaRecovery.userId, userId));
    const updated = await this.db
      .update(userAccount)
      .set({
        totpSecret: null,
        totpEnabledAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userAccount.id, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return mapUser(row);
  }

  async replaceMfaRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    await this.db.delete(authMfaRecovery).where(eq(authMfaRecovery.userId, userId));
    if (codeHashes.length === 0) return;
    await this.db.insert(authMfaRecovery).values(
      codeHashes.map((codeHash) => ({
        userId,
        codeHash,
      })),
    );
  }

  async listUnusedMfaRecovery(userId: string): Promise<MfaRecoveryRecord[]> {
    const rows = await this.db
      .select()
      .from(authMfaRecovery)
      .where(and(eq(authMfaRecovery.userId, userId), isNull(authMfaRecovery.usedAt)));
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      codeHash: row.codeHash,
      usedAt: row.usedAt ?? null,
      createdAt: row.createdAt,
    }));
  }

  async markMfaRecoveryUsed(id: string): Promise<void> {
    await this.db
      .update(authMfaRecovery)
      .set({ usedAt: new Date() })
      .where(eq(authMfaRecovery.id, id));
  }
}
