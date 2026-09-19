import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import type {
  AuthActionResponse,
  AccountDataExport,
  AccountSessionSummary,
  AuthActor,
  ChangeEmailRequest,
  ChangeEmailResponse,
  ChangePasswordRequest,
  ClaimUsernameRequest,
  DeleteAccountRequest,
  DeleteAccountResponse,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  ReauthRequest,
  ReauthResponse,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  UserProfile,
  UsernameAvailableResponse,
} from "@dang/contracts";
import {
  REAUTH_COOKIE,
  REAUTH_TTL_MS,
  classifyLoginIdentifier,
  isValidUsername,
  normalizePhone,
  normalizeUsername,
  validateUsername,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { MailerService } from "./mailer.service.js";
import { MfaService } from "./mfa.service.js";
import {
  ACCOUNT_STORE,
  RESET_TTL_MS,
  VERIFY_TTL_MS,
  authModeForUser,
  toActor,
  toProfile,
  type AccountStore,
} from "./account.types.js";
import {
  assertEmail,
  assertPasswordPolicy,
  hashPassword,
  hashToken,
  newOpaqueToken,
  verifyPassword,
} from "./password.js";
import { hashPhoneE164 } from "./phone-hash.js";
import { createAdaptiveRateLimit } from "./rate-limit.factory.js";
import {
  applyRateLimitHeaders,
  rateLimitProblemFields,
} from "./rate-limit.js";
import { clearSessionCookies, issueSessionCookie } from "./session-cookie.js";
import { SecurityEventsService } from "../security-events/security-events.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

type CookieReply = {
  setCookie: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => void;
  clearCookie?: (name: string, options?: Record<string, unknown>) => void;
  header?: (name: string, value: string) => unknown;
};

const loginRate = createAdaptiveRateLimit(20, 15 * 60_000);
const registerRate = createAdaptiveRateLimit(20, 15 * 60_000);
const forgotRate = createAdaptiveRateLimit(8, 15 * 60_000);
const usernameLookupRate = createAdaptiveRateLimit(40, 15 * 60_000);
const reauthRate = createAdaptiveRateLimit(10, 15 * 60_000);

@Injectable()
export class AccountService {
  /** In-process reauth tokens (dev / Redis-less). Redis path can be added later additive. */
  private readonly reauthTokens = new Map<
    string,
    { userId: string; expiresAt: number }
  >();

  constructor(
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(forwardRef(() => MfaService)) private readonly mfa: MfaService,
    @Inject(forwardRef(() => SecurityEventsService))
    private readonly securityEvents: SecurityEventsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** In-app security alert on personal workspace — gated by securityAlert pref. */
  private async notifyAccountSecurity(
    userId: string,
    input: { title: string; body: string; event: string },
  ): Promise<void> {
    if (!this.notifications) return;
    try {
      const personal = await this.iam.ensurePersonalWorkspace(userId);
      await this.notifications.notifySecurityAlert(userId, {
        workspaceId: personal.id,
        userId,
        title: input.title,
        body: input.body,
        event: input.event,
      });
    } catch {
      /* delivery must not block auth flows */
    }
  }

  private async resolveUserIdFromLoginId(rawId: string): Promise<string | undefined> {
    try {
      const id = rawId.trim();
      if (!id) return undefined;
      const classified = classifyLoginIdentifier(id);
      const user =
        classified.kind === "email"
          ? await this.accounts.findByEmail(assertEmail(classified.value))
          : classified.kind === "phone"
            ? await this.accounts.findByPhone(classified.value)
            : await this.accounts.findByUsername(classified.value);
      return user?.userId;
    } catch {
      return undefined;
    }
  }

  async resolveSessionActor(rawToken: string | undefined): Promise<AuthActor | null> {
    if (!rawToken?.trim()) return null;
    const session = await this.accounts.findSessionByTokenHash(hashToken(rawToken.trim()));
    if (!session) return null;
    const user = await this.accounts.findById(session.userId);
    if (!user || user.disabledAt) return null;
    return toActor(user, authModeForUser(user));
  }

  async issueSessionForUser(
    userId: string,
    reply: CookieReply,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    await this.issueSession(userId, reply, meta);
    await this.iam.ensurePersonalWorkspace(userId).catch(() => undefined);
  }

  private async profileOpts(userId: string): Promise<{ mfaEnrollmentRequired?: boolean }> {
    const needed = await this.mfa.userNeedsMfaEnrollment(userId);
    return needed ? { mfaEnrollmentRequired: true } : {};
  }

  private pruneReauthTokens(): void {
    const now = Date.now();
    for (const [key, value] of this.reauthTokens) {
      if (value.expiresAt <= now) this.reauthTokens.delete(key);
    }
  }

  /**
   * Step-up reauth: password confirm → short-lived HttpOnly cookie for high-risk ops.
   */
  async reauth(
    actor: AuthActor,
    body: ReauthRequest,
    reply: CookieReply,
    meta?: { ip?: string },
  ): Promise<ReauthResponse> {
    const rate = await reauthRate.consume(`reauth:${actor.userId}:${meta?.ip ?? "unknown"}`);
    applyRateLimitHeaders(reply, rate);
    if (!rate.allowed) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many reauth attempts",
          status: 429,
          detail: "تعداد تلاش تأیید هویت زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.accounts.findById(actor.userId);
    if (!user?.passwordHash) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth",
        title: "Password required",
        status: 401,
        detail: "برای تأیید هویت مجدد، حساب باید رمز داشته باشد",
      });
    }
    const verified = await verifyPassword(body.password, user.passwordHash);
    if (!verified.valid) {
      this.securityEvents.emit("auth.reauth_failed", {
        actorUserId: actor.userId,
        reason: "invalid_credentials",
      });
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth",
        title: "Invalid password",
        status: 401,
        detail: "رمز عبور نادرست است",
      });
    }
    this.pruneReauthTokens();
    const raw = newOpaqueToken();
    this.reauthTokens.set(hashToken(raw), {
      userId: actor.userId,
      expiresAt: Date.now() + REAUTH_TTL_MS,
    });
    const env = loadAppEnv();
    reply.setCookie(REAUTH_COOKIE, raw, {
      path: "/",
      sameSite: "lax",
      secure: env.nodeEnv === "production",
      httpOnly: true,
      maxAge: Math.floor(REAUTH_TTL_MS / 1000),
    });
    this.securityEvents.emit("auth.reauth_ok", {
      actorUserId: actor.userId,
    });
    return { ok: true, expiresInSec: Math.floor(REAUTH_TTL_MS / 1000) };
  }

  assertRecentReauth(actor: AuthActor, rawToken: string | undefined): void {
    if (!rawToken?.trim()) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/reauth-required",
        title: "Reauthentication required",
        status: 401,
        detail: "برای این عملیات ابتدا رمز خود را دوباره تأیید کنید",
      });
    }
    this.pruneReauthTokens();
    const entry = this.reauthTokens.get(hashToken(rawToken.trim()));
    if (!entry || entry.userId !== actor.userId || entry.expiresAt <= Date.now()) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/reauth-required",
        title: "Reauthentication required",
        status: 401,
        detail: "تأیید هویت منقضی شده؛ دوباره رمز را وارد کنید",
      });
    }
  }

  async register(
    body: RegisterRequest,
    reply: CookieReply,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthActionResponse> {
    const rateKey = `register:${meta?.ip ?? "unknown"}:${(body.email ?? "").toLowerCase()}`;
    const rate = await registerRate.consume(rateKey);
    applyRateLimitHeaders(reply, rate);
    if (!rate.allowed) {
      this.securityEvents.emit("auth.rate_limited", {
        reason: "register",
        attrs: { ip: meta?.ip ?? "unknown" },
      });
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many register attempts",
          status: 429,
          detail: "تعداد تلاش ثبت‌نام زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const email = assertEmail(body.email);
      assertPasswordPolicy(body.password);
      const displayName = body.displayName?.trim();
      if (!displayName || displayName.length > 80) throw new Error("DISPLAY_NAME");
      const usernameProblem = validateUsername(body.username);
      if (usernameProblem) throw new Error(usernameProblem);
      const username = normalizeUsername(body.username);
      let phone: string | null = null;
      let phoneHash: string | null = null;
      if (body.phone?.trim()) {
        phone = normalizePhone(body.phone);
        if (!phone) throw new Error("PHONE_FORMAT");
        phoneHash = hashPhoneE164(phone);
      }
      const passwordHash = await hashPassword(body.password);
      const user = await this.accounts.createLocalUser({
        email,
        displayName,
        passwordHash,
        username,
        phone,
        phoneHash,
      });
      await this.iam.upsertDevActor({
        externalSubject: user.externalSubject,
        displayName: user.displayName,
        userId: user.userId,
      });
      const debugVerifyUrl = await this.sendVerificationEmail(user.userId, user.email!);
      await this.issueSession(user.userId, reply, meta);
      await this.iam.ensurePersonalWorkspace(user.userId).catch(() => undefined);
      return {
        ok: true,
        profile: toProfile(user, "password", await this.profileOpts(user.userId)),
        actor: toActor(user, "password"),
        debugVerifyUrl,
      };
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async login(
    body: LoginRequest,
    reply: CookieReply,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    const rawId = (body.identifier ?? body.email ?? "").trim();
    const rateKey = `login:${meta?.ip ?? "unknown"}:${rawId.toLowerCase()}`;
    const rate = await loginRate.consume(rateKey);
    applyRateLimitHeaders(reply, rate);
    if (!rate.allowed) {
      const targetUserId = await this.resolveUserIdFromLoginId(rawId);
      this.securityEvents.emit("auth.rate_limited", {
        actorUserId: targetUserId,
        reason: "login",
        attrs: { ip: meta?.ip ?? "unknown" },
      });
      if (targetUserId) {
        void this.notifyAccountSecurity(targetUserId, {
          title: "محدودیت تلاش ورود",
          body: "به‌خاطر تلاش‌های زیاد ورود، درخواست‌های بعدی موقتاً محدود شد.",
          event: "auth.rate_limited",
        });
      }
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many login attempts",
          status: 429,
          detail: "تعداد تلاش ورود زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let knownUserId: string | undefined;
    try {
      if (!rawId) throw new Error("AUTH_INVALID");
      const classified = classifyLoginIdentifier(rawId);
      const user =
        classified.kind === "email"
          ? await this.accounts.findByEmail(assertEmail(classified.value))
          : classified.kind === "phone"
            ? await this.accounts.findByPhone(classified.value)
            : await this.accounts.findByUsername(classified.value);
      if (!user?.passwordHash) throw new Error("AUTH_INVALID");
      if (user.disabledAt) throw new Error("AUTH_INVALID");
      knownUserId = user.userId;
      const verified = await verifyPassword(body.password, user.passwordHash);
      if (!verified.valid) throw new Error("AUTH_INVALID");
      if (verified.needsRehash) {
        await this.accounts.setPasswordHash(
          user.userId,
          await hashPassword(body.password),
        );
      }

      if (user.totpEnabledAt) {
        const challengeId = await this.mfa.createChallenge(user.userId);
        return { mfaRequired: true, challengeId };
      }

      await this.issueSession(user.userId, reply, meta);
      await this.iam.ensurePersonalWorkspace(user.userId).catch(() => undefined);
      return {
        ok: true,
        profile: toProfile(user, "password", await this.profileOpts(user.userId)),
        actor: toActor(user, "password"),
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AUTH_INVALID") {
        this.securityEvents.emit("auth.login_failed", {
          actorUserId: knownUserId,
          reason: "invalid_credentials",
          attrs: { ip: meta?.ip ?? "unknown" },
        });
        if (knownUserId) {
          void this.notifyAccountSecurity(knownUserId, {
            title: "تلاش ورود ناموفق",
            body: "یک تلاش ورود با رمز نادرست برای حساب شما ثبت شد.",
            event: "auth.login_failed",
          });
        }
      }
      this.rethrow(error);
    }
  }

  async logout(rawToken: string | undefined, reply: CookieReply): Promise<{ ok: true }> {
    if (rawToken?.trim()) {
      const session = await this.accounts.findSessionByTokenHash(hashToken(rawToken.trim()));
      if (session) await this.accounts.revokeSession(session.id);
    }
    this.clearCookie(reply);
    return { ok: true };
  }

  async profile(actor: AuthActor): Promise<UserProfile> {
    const user = await this.accounts.findById(actor.userId);
    if (!user) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
      });
    }
    return toProfile(user, actor.authMode, await this.profileOpts(user.userId));
  }

  async updateProfile(actor: AuthActor, body: UpdateProfileRequest): Promise<UserProfile> {
    try {
      if (body.displayName !== undefined) {
        const name = body.displayName.trim();
        if (!name || name.length > 80) throw new Error("DISPLAY_NAME");
      }
      let user = await this.accounts.updateProfile(actor.userId, {
        displayName: body.displayName,
        locale: body.locale,
        timezone: body.timezone,
        avatarUrl: body.avatarUrl,
      });
      const identity: {
        username?: string;
        phone?: string | null;
        phoneHash?: string | null;
        displayUnit?: "rial" | "toman" | null;
      } = {};
      if (body.username !== undefined) {
        const problem = validateUsername(body.username);
        if (problem) throw new Error(problem);
        identity.username = normalizeUsername(body.username);
      }
      if (body.phone !== undefined) {
        if (body.phone === null || body.phone.trim() === "") {
          identity.phone = null;
          identity.phoneHash = null;
        } else {
          const phone = normalizePhone(body.phone);
          if (!phone) throw new Error("PHONE_FORMAT");
          identity.phone = phone;
          identity.phoneHash = hashPhoneE164(phone);
        }
      }
      if (body.displayUnit !== undefined) {
        identity.displayUnit = body.displayUnit;
      }
      if (
        identity.username !== undefined ||
        identity.phone !== undefined ||
        identity.displayUnit !== undefined
      ) {
        user = await this.accounts.setIdentityFields(actor.userId, identity);
      }
      return toProfile(user, actor.authMode, await this.profileOpts(user.userId));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async changeEmail(
    actor: AuthActor,
    body: ChangeEmailRequest,
  ): Promise<ChangeEmailResponse> {
    try {
      const newEmail = assertEmail(body.newEmail);
      const user = await this.accounts.findById(actor.userId);
      if (!user?.passwordHash) throw new Error("NO_PASSWORD");
      const verified = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!verified.valid) throw new Error("AUTH_INVALID");
      if (user.email?.toLowerCase() === newEmail) {
        return {
          ok: true,
          profile: toProfile(user, actor.authMode, await this.profileOpts(user.userId)),
        };
      }
      const updated = await this.accounts.changeEmail(actor.userId, newEmail);
      const debugVerifyUrl = await this.sendVerificationEmail(updated.userId, newEmail);
      return {
        ok: true,
        profile: toProfile(updated, actor.authMode, await this.profileOpts(updated.userId)),
        debugVerifyUrl,
      };
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async claimUsername(
    actor: AuthActor,
    body: ClaimUsernameRequest,
  ): Promise<UserProfile> {
    try {
      const problem = validateUsername(body.username);
      if (problem) throw new Error(problem);
      const username = normalizeUsername(body.username);
      const existing = await this.accounts.findById(actor.userId);
      if (!existing) throw new Error("USER_NOT_FOUND");
      if (existing.username) throw new Error("USERNAME_ALREADY_SET");
      const user = await this.accounts.setIdentityFields(actor.userId, {
        username,
        usernameChangedAt: new Date(),
      });
      return toProfile(user, actor.authMode, await this.profileOpts(user.userId));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async usernameAvailable(
    usernameRaw: string,
    meta?: { ip?: string },
    reply?: CookieReply,
  ): Promise<UsernameAvailableResponse> {
    const rateKey = `username:${meta?.ip ?? "unknown"}`;
    const rate = await usernameLookupRate.consume(rateKey);
    applyRateLimitHeaders(reply, rate);
    if (!rate.allowed) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many lookups",
          status: 429,
          detail: "درخواست زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const username = normalizeUsername(usernameRaw);
    if (!isValidUsername(username)) {
      return { username, available: false };
    }
    const taken = await this.accounts.findByUsername(username);
    return { username, available: !taken };
  }

  async changePassword(actor: AuthActor, body: ChangePasswordRequest): Promise<{ ok: true }> {
    try {
      assertPasswordPolicy(body.newPassword);
      const user = await this.accounts.findById(actor.userId);
      if (!user?.passwordHash) throw new Error("NO_PASSWORD");
      const verified = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!verified.valid) throw new Error("AUTH_INVALID");
      await this.accounts.setPasswordHash(actor.userId, await hashPassword(body.newPassword));
      await this.accounts.revokeAllSessions(actor.userId);
      this.securityEvents.emit("auth.password_changed", {
        actorUserId: actor.userId,
        targetType: "account",
        targetId: actor.userId,
      });
      void this.notifyAccountSecurity(actor.userId, {
        title: "رمز عبور تغییر کرد",
        body: "رمز حساب شما عوض شد و همهٔ نشست‌ها باطل شدند.",
        event: "auth.password_changed",
      });
      return { ok: true };
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  /** Revoke every session for the user (forces re-login everywhere). */
  async revokeAllSessions(actor: AuthActor): Promise<{ ok: true }> {
    await this.accounts.revokeAllSessions(actor.userId);
    this.securityEvents.emit("auth.sessions_revoked", {
      actorUserId: actor.userId,
      targetType: "account",
      targetId: actor.userId,
      reason: "revoke_all",
    });
    void this.notifyAccountSecurity(actor.userId, {
      title: "همهٔ نشست‌ها باطل شد",
      body: "از همهٔ دستگاه‌ها خارج شدید؛ برای ورود دوباره رمز لازم است.",
      event: "auth.sessions_revoked",
    });
    return { ok: true };
  }

  async listSessions(
    actor: AuthActor,
    rawToken?: string,
  ): Promise<AccountSessionSummary[]> {
    const currentHash = rawToken?.trim() ? hashToken(rawToken.trim()) : null;
    const sessions = await this.accounts.listActiveSessions(actor.userId);
    return sessions.map((session) => ({
      id: session.id,
      current: currentHash === session.tokenHash,
      ip: session.ip,
      userAgent: session.userAgent,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    }));
  }

  async revokeSession(
    actor: AuthActor,
    sessionId: string,
    rawToken?: string,
  ): Promise<{ ok: true; currentRevoked: boolean }> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Invalid session id",
        status: 400,
      });
    }
    const sessions = await this.accounts.listActiveSessions(actor.userId);
    const target = sessions.find((session) => session.id === sessionId);
    if (!target) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Active session not found",
        status: 404,
      });
    }
    const revoked = await this.accounts.revokeSessionForUser(sessionId, actor.userId);
    if (!revoked) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Active session not found",
        status: 404,
      });
    }
    const currentHash = rawToken?.trim() ? hashToken(rawToken.trim()) : null;
    const currentRevoked = currentHash === target.tokenHash;
    this.securityEvents.emit("auth.session_revoked", {
      actorUserId: actor.userId,
      targetType: "session",
      targetId: sessionId,
    });
    if (!currentRevoked) {
      void this.notifyAccountSecurity(actor.userId, {
        title: "یک نشست بسته شد",
        body: "یک دستگاه/نشست دیگر از حساب شما خارج شد.",
        event: "auth.session_revoked",
      });
    }
    return { ok: true, currentRevoked };
  }

  async exportMyData(
    actor: AuthActor,
    rawToken?: string,
    reauthToken?: string,
  ): Promise<AccountDataExport> {
    this.assertRecentReauth(actor, reauthToken);
    const user = await this.accounts.findById(actor.userId);
    if (!user) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
      });
    }
    if (user.externalSubject.startsWith("deleted:")) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Account already anonymized",
        status: 400,
        detail: "این حساب قبلاً ناشناس‌سازی شده است",
      });
    }
    const [profile, workspaces, sessions] = await Promise.all([
      this.profile(actor),
      this.iam.listWorkspacesForUser(actor.userId),
      this.listSessions(actor, rawToken),
    ]);
    this.securityEvents.emit("privacy.data_exported", {
      actorUserId: actor.userId,
      targetType: "account",
      targetId: actor.userId,
    });
    void this.notifyAccountSecurity(actor.userId, {
      title: "خروجی دادهٔ حساب",
      body: "یک بستهٔ export حریم خصوصی برای حساب شما ساخته شد.",
      event: "privacy.data_exported",
    });
    return {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      profile,
      workspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        template: w.template,
      })),
      sessions,
      notes: [
        "رمز عبور، TOTP و هش نشست صادر نمی‌شود.",
        "دادهٔ مالی workspace جدا از این بسته است؛ از گزارش‌های workspace استفاده کنید.",
        "R10-14 برش ۱ — docs/ops/PRIVACY-DATA-EXPORT.md",
      ],
    };
  }

  async deleteMyAccount(
    actor: AuthActor,
    body: DeleteAccountRequest,
    reply: CookieReply,
    reauthToken?: string,
  ): Promise<DeleteAccountResponse> {
    this.assertRecentReauth(actor, reauthToken);
    const user = await this.accounts.findById(actor.userId);
    if (!user) {
      throw new UnauthorizedException({
        type: "https://dang.local/problems/auth-required",
        title: "Authentication required",
        status: 401,
      });
    }
    if (user.externalSubject.startsWith("deleted:")) {
      throw new BadRequestException({
        type: "https://dang.local/problems/validation",
        title: "Account already anonymized",
        status: 400,
        detail: "این حساب قبلاً ناشناس‌سازی شده است",
      });
    }
    if (user.passwordHash) {
      if (!body.password?.trim()) {
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: "Password required",
          status: 400,
          detail: "برای حذف حساب، رمز فعلی لازم است",
        });
      }
      const verified = await verifyPassword(body.password, user.passwordHash);
      if (!verified.valid) {
        throw new UnauthorizedException({
          type: "https://dang.local/problems/auth",
          title: "Invalid password",
          status: 401,
          detail: "رمز عبور نادرست است",
        });
      }
    }
    await this.accounts.anonymizeAccount(actor.userId);
    this.securityEvents.emit("auth.account_anonymized", {
      actorUserId: actor.userId,
      targetType: "account",
      targetId: actor.userId,
    });
    clearSessionCookies(reply);
    return { ok: true, anonymized: true };
  }

  async forgotPassword(
    body: { email: string },
    reply?: CookieReply,
  ): Promise<ForgotPasswordResponse> {
    const env = loadAppEnv();
    const rateKey = `forgot:${(body.email ?? "").toLowerCase()}`;
    const rate = await forgotRate.consume(rateKey);
    applyRateLimitHeaders(reply, rate);
    if (!rate.allowed) {
      const targetUserId = await this.resolveUserIdFromLoginId(body.email ?? "");
      this.securityEvents.emit("auth.rate_limited", {
        actorUserId: targetUserId,
        reason: "forgot_password",
      });
      if (targetUserId) {
        void this.notifyAccountSecurity(targetUserId, {
          title: "محدودیت بازیابی رمز",
          body: "درخواست‌های بازیابی رمز موقتاً محدود شد.",
          event: "auth.rate_limited",
        });
      }
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many reset requests",
          status: 429,
          detail: "درخواست بازیابی زیاد است؛ کمی بعد دوباره امتحان کنید",
          ...rateLimitProblemFields(rate),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const email = assertEmail(body.email);
      const user = await this.accounts.findByEmail(email);
      let debugResetUrl: string | undefined;
      if (user?.passwordHash) {
        const token = newOpaqueToken();
        await this.accounts.createPasswordReset({
          userId: user.userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + RESET_TTL_MS),
        });
        debugResetUrl = `${env.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
        const sent = this.mailer.send({
          to: email,
          subject: "بازیابی رمز عبور دنگ",
          text: "برای تنظیم رمز جدید روی لینک کلیک کنید.",
          actionUrl: debugResetUrl,
        });
        if (!sent.delivered && !env.allowDevAuth) {
          debugResetUrl = undefined;
        } else if (sent.debugUrl) {
          debugResetUrl = sent.debugUrl;
        }
      }
      return { ok: true, debugResetUrl: env.allowDevAuth ? debugResetUrl : undefined };
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "EMAIL_INVALID") {
        return { ok: true };
      }
      this.rethrow(error);
    }
  }

  async resetPassword(
    body: ResetPasswordRequest,
    reply: CookieReply,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthActionResponse> {
    try {
      assertPasswordPolicy(body.password);
      const token = body.token?.trim();
      if (!token) throw new Error("RESET_INVALID");
      const reset = await this.accounts.findPasswordResetByTokenHash(hashToken(token));
      if (!reset) throw new Error("RESET_INVALID");
      await this.accounts.setPasswordHash(reset.userId, await hashPassword(body.password));
      await this.accounts.markPasswordResetUsed(reset.id);
      await this.accounts.revokeAllSessions(reset.userId);
      const user = await this.accounts.findById(reset.userId);
      if (!user) throw new Error("USER_NOT_FOUND");
      await this.issueSession(user.userId, reply, meta);
      return {
        ok: true,
        profile: toProfile(user, "password", await this.profileOpts(user.userId)),
        actor: toActor(user, "password"),
      };
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async verifyEmail(token: string): Promise<UserProfile> {
    try {
      const trimmed = token?.trim();
      if (!trimmed) throw new Error("VERIFY_INVALID");
      const row = await this.accounts.findEmailVerificationByTokenHash(hashToken(trimmed));
      if (!row) throw new Error("VERIFY_INVALID");
      const user = await this.accounts.markEmailVerified(row.userId);
      await this.accounts.markEmailVerificationUsed(row.id);
      return toProfile(user, authModeForUser(user), await this.profileOpts(user.userId));
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  async resendVerification(actor: AuthActor): Promise<{ ok: true; debugVerifyUrl?: string }> {
    const user = await this.accounts.findById(actor.userId);
    if (!user?.email) throw new BadRequestException({ title: "No email", status: 400 });
    if (user.emailVerifiedAt) return { ok: true };
    const debugVerifyUrl = await this.sendVerificationEmail(user.userId, user.email);
    const env = loadAppEnv();
    return { ok: true, debugVerifyUrl: env.allowDevAuth ? debugVerifyUrl : undefined };
  }

  private async sendVerificationEmail(userId: string, email: string): Promise<string | undefined> {
    const env = loadAppEnv();
    const token = newOpaqueToken();
    await this.accounts.createEmailVerification({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
    });
    const url = `${env.webOrigin}/verify-email?token=${encodeURIComponent(token)}`;
    const sent = this.mailer.send({
      to: email,
      subject: "تأیید ایمیل دنگ",
      text: "برای تأیید ایمیل روی لینک کلیک کنید.",
      actionUrl: url,
    });
    return env.allowDevAuth ? sent.debugUrl ?? url : undefined;
  }

  private async issueSession(
    userId: string,
    reply: CookieReply,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    await issueSessionCookie(this.accounts, userId, reply, meta);
  }

  private clearCookie(reply: CookieReply): void {
    clearSessionCookies(reply);
  }

  private rethrow(error: unknown): never {
    if (error instanceof Error) {
      const map: Record<string, { title: string; detail: string; status?: number }> = {
        EMAIL_INVALID: { title: "Invalid email", detail: "آدرس ایمیل نامعتبر است" },
        EMAIL_TAKEN: { title: "Email taken", detail: "این ایمیل قبلاً ثبت شده است" },
        USERNAME_TAKEN: {
          title: "Username taken",
          detail: "این نام کاربری قبلاً گرفته شده است",
          status: 409,
        },
        USERNAME_ALREADY_SET: {
          title: "Username already set",
          detail: "نام کاربری قبلاً انتخاب شده است",
        },
        USERNAME_EMPTY: { title: "Invalid username", detail: "نام کاربری الزامی است" },
        USERNAME_TOO_SHORT: {
          title: "Invalid username",
          detail: "نام کاربری حداقل ۳ کاراکتر باشد",
        },
        USERNAME_TOO_LONG: {
          title: "Invalid username",
          detail: "نام کاربری حداکثر ۳۲ کاراکتر باشد",
        },
        USERNAME_CHARSET: {
          title: "Invalid username",
          detail: "نام کاربری فقط حروف لاتین، عدد، نقطه و خط‌زیر",
        },
        USERNAME_START: {
          title: "Invalid username",
          detail: "نام کاربری باید با حرف شروع شود",
        },
        USERNAME_END: {
          title: "Invalid username",
          detail: "نام کاربری نباید با نقطه یا خط‌زیر تمام شود",
        },
        USERNAME_DOUBLE_SEPARATOR: {
          title: "Invalid username",
          detail: "دو نقطه یا خط‌زیر پشت‌سرهم مجاز نیست",
        },
        USERNAME_RESERVED: {
          title: "Invalid username",
          detail: "این نام کاربری رزرو شده است",
        },
        PHONE_TAKEN: {
          title: "Phone taken",
          detail: "این شماره قبلاً ثبت شده است",
          status: 409,
        },
        PHONE_FORMAT: {
          title: "Invalid phone",
          detail: "شماره موبایل نامعتبر است",
        },
        PASSWORD_TOO_SHORT: {
          title: "Weak password",
          detail: "رمز عبور حداقل ۱۰ کاراکتر باشد",
        },
        PASSWORD_TOO_LONG: { title: "Weak password", detail: "رمز عبور بیش از حد طولانی است" },
        PASSWORD_WEAK: {
          title: "Weak password",
          detail: "رمز عبور باید شامل حرف و عدد باشد",
        },
        DISPLAY_NAME: { title: "Invalid name", detail: "نام نمایشی نامعتبر است" },
        AUTH_INVALID: {
          title: "Invalid credentials",
          detail: "شناسه یا رمز عبور نادرست است",
          status: 401,
        },
        RESET_INVALID: {
          title: "Invalid reset token",
          detail: "لینک بازیابی نامعتبر یا منقضی است",
        },
        NO_PASSWORD: {
          title: "No password",
          detail: "این حساب رمز محلی ندارد",
        },
        USER_NOT_FOUND: { title: "Not found", detail: "کاربر یافت نشد", status: 401 },
        VERIFY_INVALID: {
          title: "Invalid verify token",
          detail: "لینک تأیید نامعتبر یا منقضی است",
        },
      };
      const mapped = map[error.message];
      if (mapped) {
        const status = mapped.status ?? 400;
        if (status === 401) {
          throw new UnauthorizedException({
            type: "https://dang.local/problems/auth",
            title: mapped.title,
            status,
            detail: mapped.detail,
          });
        }
        if (status === 409) {
          throw new ConflictException({
            type: "https://dang.local/problems/conflict",
            title: mapped.title,
            status,
            detail: mapped.detail,
          });
        }
        throw new BadRequestException({
          type: "https://dang.local/problems/validation",
          title: mapped.title,
          status,
          detail: mapped.detail,
        });
      }
    }
    throw error;
  }
}
