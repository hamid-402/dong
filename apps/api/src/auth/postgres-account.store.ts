import {
  and,
  authEmailVerify,
  authMfaRecovery,
  authPasswordReset,
  authSession,
  createDatabase,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
  userAccount,
  type AppDatabase,
} from "@dang/db";
import type { PlatformRole, UpdateProfileRequest } from "@dang/contracts";
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
    username: row.username ?? null,
    phone: row.phone ?? null,
    phoneHash: row.phoneHash ?? null,
    phoneVerifiedAt: row.phoneVerifiedAt ?? null,
    platformRole:
      row.platformRole === "platform_owner" || row.platformRole === "platform_support"
        ? row.platformRole
        : "user",
    displayUnit:
      row.displayUnit === "rial" || row.displayUnit === "toman" ? row.displayUnit : null,
    usernameChangedAt: row.usernameChangedAt ?? null,
    disabledAt: row.disabledAt ?? null,
    disabledByUserId: row.disabledByUserId ?? null,
    disabledReason: row.disabledReason ?? null,
    totpSecret: row.totpSecret ?? null,
    totpEnabledAt: row.totpEnabledAt ?? null,
    createdAt: row.createdAt,
  };
}

function mapSession(row: typeof authSession.$inferSelect): SessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt ?? null,
    ip: row.ip ?? undefined,
    userAgent: row.userAgent ?? undefined,
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

  async findByUsername(username: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select()
      .from(userAccount)
      .where(sql`lower(${userAccount.username}) = ${username.toLowerCase()}`)
      .limit(1);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByPhone(phoneE164: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select()
      .from(userAccount)
      .where(eq(userAccount.phone, phoneE164))
      .limit(1);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByPhoneHash(phoneHash: string): Promise<AccountRecord | null> {
    const rows = await this.db
      .select()
      .from(userAccount)
      .where(eq(userAccount.phoneHash, phoneHash))
      .limit(1);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async createLocalUser(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    username: string;
    phone?: string | null;
    phoneHash?: string | null;
  }): Promise<AccountRecord> {
    const email = input.email.toLowerCase();
    const username = input.username.toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) throw new Error("EMAIL_TAKEN");
    if (await this.findByUsername(username)) throw new Error("USERNAME_TAKEN");
    if (input.phone && (await this.findByPhone(input.phone))) throw new Error("PHONE_TAKEN");
    try {
      const inserted = await this.db
        .insert(userAccount)
        .values({
          externalSubject: `local:${email}`,
          displayName: input.displayName.trim(),
          email,
          passwordHash: input.passwordHash,
          username,
          phone: input.phone ?? null,
          phoneHash: input.phoneHash ?? null,
          usernameChangedAt: new Date(),
          platformRole: "user",
          locale: "fa-IR",
          timezone: "Asia/Tehran",
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("USER_CREATE_FAILED");
      return mapUser(row);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/username/i.test(msg) && /unique|duplicate/i.test(msg)) {
        throw new Error("USERNAME_TAKEN");
      }
      if (/phone/i.test(msg) && /unique|duplicate/i.test(msg)) {
        throw new Error("PHONE_TAKEN");
      }
      if (/email/i.test(msg) && /unique|duplicate/i.test(msg)) {
        throw new Error("EMAIL_TAKEN");
      }
      throw error;
    }
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

  async setIdentityFields(
    userId: string,
    patch: {
      username?: string;
      phone?: string | null;
      phoneHash?: string | null;
      displayUnit?: "rial" | "toman" | null;
      usernameChangedAt?: Date | null;
    },
  ): Promise<AccountRecord> {
    if (patch.username !== undefined) {
      const taken = await this.findByUsername(patch.username);
      if (taken && taken.userId !== userId) throw new Error("USERNAME_TAKEN");
    }
    if (patch.phone) {
      const taken = await this.findByPhone(patch.phone);
      if (taken && taken.userId !== userId) throw new Error("PHONE_TAKEN");
    }
    const updates: Partial<typeof userAccount.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (patch.username !== undefined) {
      updates.username = patch.username.toLowerCase();
      updates.usernameChangedAt = patch.usernameChangedAt ?? new Date();
    }
    if (patch.phone !== undefined) {
      updates.phone = patch.phone;
      updates.phoneHash = patch.phoneHash ?? null;
      updates.phoneVerifiedAt = null;
    }
    if (patch.displayUnit !== undefined) {
      updates.displayUnit = patch.displayUnit;
    }
    try {
      const updated = await this.db
        .update(userAccount)
        .set(updates)
        .where(eq(userAccount.id, userId))
        .returning();
      const row = updated[0];
      if (!row) throw new Error("USER_NOT_FOUND");
      return mapUser(row);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/username/i.test(msg) && /unique|duplicate/i.test(msg)) {
        throw new Error("USERNAME_TAKEN");
      }
      if (/phone/i.test(msg) && /unique|duplicate/i.test(msg)) {
        throw new Error("PHONE_TAKEN");
      }
      throw error;
    }
  }

  async changeEmail(userId: string, newEmail: string): Promise<AccountRecord> {
    const email = newEmail.toLowerCase();
    const taken = await this.findByEmail(email);
    if (taken && taken.userId !== userId) throw new Error("EMAIL_TAKEN");
    const updated = await this.db
      .update(userAccount)
      .set({
        email,
        emailVerifiedAt: null,
        externalSubject: `local:${email}`,
        updatedAt: new Date(),
      })
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
    return mapSession(row);
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
    return mapSession(row);
  }

  async listActiveSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db
      .select()
      .from(authSession)
      .where(
        and(
          eq(authSession.userId, userId),
          isNull(authSession.revokedAt),
          sql`${authSession.expiresAt} > now()`,
        ),
      )
      .orderBy(sql`${authSession.createdAt} desc`);
    return rows.map(mapSession);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.db
      .update(authSession)
      .set({ revokedAt: new Date() })
      .where(eq(authSession.id, sessionId));
  }

  async revokeSessionForUser(sessionId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .update(authSession)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(authSession.id, sessionId),
          eq(authSession.userId, userId),
          isNull(authSession.revokedAt),
        ),
      )
      .returning({ id: authSession.id });
    return Boolean(rows[0]);
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

  async anonymizeAccount(userId: string): Promise<AccountRecord> {
    await this.db.delete(authMfaRecovery).where(eq(authMfaRecovery.userId, userId));
    await this.db
      .update(authSession)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSession.userId, userId), isNull(authSession.revokedAt)));
    const tombstoneEmail = `deleted+${userId}@invalid.local`;
    const tombstoneSubject = `deleted:${userId}`;
    const updated = await this.db
      .update(userAccount)
      .set({
        email: tombstoneEmail,
        emailVerifiedAt: null,
        displayName: "حساب حذف‌شده",
        avatarUrl: null,
        passwordHash: null,
        totpSecret: null,
        totpEnabledAt: null,
        username: null,
        phone: null,
        phoneHash: null,
        phoneVerifiedAt: null,
        displayUnit: null,
        usernameChangedAt: null,
        externalSubject: tombstoneSubject,
        updatedAt: new Date(),
      })
      .where(eq(userAccount.id, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return mapUser(row);
  }

  async searchUsers(input: {
    q?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: AccountRecord[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    const offset = Math.max(Number.parseInt(input.cursor ?? "0", 10) || 0, 0);
    const q = (input.q ?? "").trim();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const where = q
      ? or(
          ilike(userAccount.email, `%${q}%`),
          ilike(userAccount.username, `%${q}%`),
          ilike(userAccount.displayName, `%${q}%`),
          ...(uuidRe.test(q) ? [eq(userAccount.id, q)] : []),
        )
      : undefined;
    const rows = await this.db
      .select()
      .from(userAccount)
      .where(where)
      .orderBy(desc(userAccount.createdAt), userAccount.id)
      .limit(limit + 1)
      .offset(offset);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(mapUser),
      nextCursor: hasMore ? String(offset + page.length) : undefined,
    };
  }

  async setPlatformRole(userId: string, platformRole: PlatformRole): Promise<AccountRecord> {
    const updated = await this.db
      .update(userAccount)
      .set({ platformRole, updatedAt: new Date() })
      .where(eq(userAccount.id, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return mapUser(row);
  }

  async setDisabled(
    userId: string,
    patch: {
      disabledAt: Date | null;
      disabledByUserId: string | null;
      disabledReason: string | null;
    },
  ): Promise<AccountRecord> {
    if (patch.disabledAt) {
      await this.db
        .update(authSession)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSession.userId, userId), isNull(authSession.revokedAt)));
    }
    const updated = await this.db
      .update(userAccount)
      .set({
        disabledAt: patch.disabledAt,
        disabledByUserId: patch.disabledByUserId,
        disabledReason: patch.disabledReason,
        updatedAt: new Date(),
      })
      .where(eq(userAccount.id, userId))
      .returning();
    const row = updated[0];
    if (!row) throw new Error("USER_NOT_FOUND");
    return mapUser(row);
  }

  async countActivePlatformOwners(): Promise<number> {
    const rows = await this.db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(
        and(eq(userAccount.platformRole, "platform_owner"), isNull(userAccount.disabledAt)),
      );
    return rows.length;
  }
}
