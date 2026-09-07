import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { loadAppEnv } from "@dang/config";
import type {
  AuthActionResponse,
  AuthActor,
  ChangePasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  UserProfile,
} from "@dang/contracts";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { MailerService } from "./mailer.service.js";
import { MfaService } from "./mfa.service.js";
import {
  ACCOUNT_STORE,
  RESET_TTL_MS,
  SESSION_COOKIE,
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
import { createAdaptiveRateLimit } from "./rate-limit.factory.js";

type CookieReply = {
  setCookie: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => void;
  clearCookie?: (name: string, options?: Record<string, unknown>) => void;
};

const loginRate = createAdaptiveRateLimit(20, 15 * 60_000);
const registerRate = createAdaptiveRateLimit(20, 15 * 60_000);
const forgotRate = createAdaptiveRateLimit(8, 15 * 60_000);

@Injectable()
export class AccountService {
  constructor(
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(MailerService) private readonly mailer: MailerService,
    @Inject(forwardRef(() => MfaService)) private readonly mfa: MfaService,
  ) {}

  async resolveSessionActor(rawToken: string | undefined): Promise<AuthActor | null> {
    if (!rawToken?.trim()) return null;
    const session = await this.accounts.findSessionByTokenHash(hashToken(rawToken.trim()));
    if (!session) return null;
    const user = await this.accounts.findById(session.userId);
    if (!user) return null;
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

  async register(
    body: RegisterRequest,
    reply: CookieReply,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthActionResponse> {
    const rateKey = `register:${meta?.ip ?? "unknown"}:${(body.email ?? "").toLowerCase()}`;
    if (!(await registerRate.allow(rateKey))) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many register attempts",
          status: 429,
          detail: "تعداد تلاش ثبت‌نام زیاد است؛ کمی بعد دوباره امتحان کنید",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const email = assertEmail(body.email);
      assertPasswordPolicy(body.password);
      const displayName = body.displayName?.trim();
      if (!displayName || displayName.length > 80) throw new Error("DISPLAY_NAME");
      const passwordHash = await hashPassword(body.password);
      const user = await this.accounts.createLocalUser({
        email,
        displayName,
        passwordHash,
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
    const rateKey = `login:${meta?.ip ?? "unknown"}:${(body.email ?? "").toLowerCase()}`;
    if (!(await loginRate.allow(rateKey))) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many login attempts",
          status: 429,
          detail: "تعداد تلاش ورود زیاد است؛ کمی بعد دوباره امتحان کنید",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const email = assertEmail(body.email);
      const user = await this.accounts.findByEmail(email);
      if (!user?.passwordHash) throw new Error("AUTH_INVALID");
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
      const user = await this.accounts.updateProfile(actor.userId, body);
      return toProfile(user, actor.authMode, await this.profileOpts(user.userId));
    } catch (error: unknown) {
      this.rethrow(error);
    }
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
      return { ok: true };
    } catch (error: unknown) {
      this.rethrow(error);
    }
  }

  /** Revoke every session for the user (forces re-login everywhere). */
  async revokeAllSessions(actor: AuthActor): Promise<{ ok: true }> {
    await this.accounts.revokeAllSessions(actor.userId);
    return { ok: true };
  }

  async forgotPassword(body: { email: string }): Promise<ForgotPasswordResponse> {
    const env = loadAppEnv();
    const rateKey = `forgot:${(body.email ?? "").toLowerCase()}`;
    if (!(await forgotRate.allow(rateKey))) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many reset requests",
          status: 429,
          detail: "درخواست بازیابی زیاد است؛ کمی بعد دوباره امتحان کنید",
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
    const { issueSessionCookie } = await import("./session-cookie.js");
    await issueSessionCookie(this.accounts, userId, reply, meta);
  }

  private clearCookie(reply: CookieReply): void {
    const env = loadAppEnv();
    reply.clearCookie?.(SESSION_COOKIE, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: env.nodeEnv === "production",
    });
  }

  private rethrow(error: unknown): never {
    if (error instanceof Error) {
      const map: Record<string, { title: string; detail: string; status?: number }> = {
        EMAIL_INVALID: { title: "Invalid email", detail: "آدرس ایمیل نامعتبر است" },
        EMAIL_TAKEN: { title: "Email taken", detail: "این ایمیل قبلاً ثبت شده است" },
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
          detail: "ایمیل یا رمز عبور نادرست است",
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
