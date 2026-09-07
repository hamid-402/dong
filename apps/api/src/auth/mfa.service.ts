import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import { isRedisConfigured, loadAppEnv } from "@dang/config";
import type {
  AuthActionResponse,
  AuthActor,
  MfaConfirmRequest,
  MfaConfirmResponse,
  MfaDisableRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  MembershipRole,
} from "@dang/contracts";
import * as OTPAuth from "otpauth";
import { randomBytes } from "node:crypto";
import { getRedisClient } from "../jobs/redis-queue.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";
import { AccountService } from "./account.service.js";
import {
  ACCOUNT_STORE,
  MFA_CHALLENGE_TTL_MS,
  authModeForUser,
  toActor,
  toProfile,
  type AccountStore,
} from "./account.types.js";
import { hashToken, newOpaqueToken, verifyPassword } from "./password.js";
import { createAdaptiveRateLimit } from "./rate-limit.factory.js";

const SENSITIVE_ROLES: ReadonlySet<MembershipRole> = new Set([
  "owner",
  "admin",
  "finance",
]);

const RECOVERY_CODE_COUNT = 10;
const ISSUER = "دنگ";
const MFA_CHALLENGE_REDIS_PREFIX = "mfa:chal:";
const MFA_CHALLENGE_TTL_SEC = Math.floor(MFA_CHALLENGE_TTL_MS / 1000);

const mfaVerifyRate = createAdaptiveRateLimit(20, 15 * 60_000);

type MfaChallenge = {
  userId: string;
  expiresAt: number;
};

type CookieReply = {
  setCookie: (
    name: string,
    value: string,
    options: Record<string, unknown>,
  ) => void;
  clearCookie?: (name: string, options?: Record<string, unknown>) => void;
};

@Injectable()
export class MfaService {
  /** In-process fallback when Redis is not configured or unavailable. */
  private readonly challenges = new Map<string, MfaChallenge>();

  constructor(
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(forwardRef(() => AccountService))
    private readonly accountService: AccountService,
  ) {}

  generateSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  verifyToken(secret: string, token: string, window = 1): boolean {
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: token.trim(), window });
    return delta !== null;
  }

  async userNeedsMfaEnrollment(userId: string): Promise<boolean> {
    const user = await this.accounts.findById(userId);
    if (!user || user.totpEnabledAt) return false;
    const roles = await this.iam.listActiveRolesForUser(userId);
    return roles.some((role) => SENSITIVE_ROLES.has(role));
  }

  /**
   * Lightweight gate for finance-manager actions (invoice generate / settlement confirm).
   * Matches system capabilities.mfa — skip when MFA capability is off or user already enrolled.
   */
  mfaCapabilityEnabled(): boolean {
    return true;
  }

  async assertMfaEnrolledForFinanceAction(userId: string): Promise<void> {
    if (!this.mfaCapabilityEnabled()) return;
    if (!(await this.userNeedsMfaEnrollment(userId))) return;
    throw new ForbiddenException({
      type: "https://dang.local/problems/mfa-enrollment-required",
      title: "MFA enrollment required",
      status: 403,
      detail:
        "برای عملیات مالی حساس ابتدا احراز هویت دو مرحله‌ای را در حساب فعال کنید",
    });
  }

  /**
   * Prefer Redis + TTL when available; fall back to in-process Map (dev / Redis down).
   */
  async createChallenge(userId: string): Promise<string> {
    const challengeId = newOpaqueToken();
    const expiresAt = Date.now() + MFA_CHALLENGE_TTL_MS;
    const payload = { userId };

    if (isRedisConfigured(loadAppEnv())) {
      const redis = await getRedisClient();
      if (redis) {
        try {
          await redis.set(
            `${MFA_CHALLENGE_REDIS_PREFIX}${challengeId}`,
            JSON.stringify(payload),
            "EX",
            MFA_CHALLENGE_TTL_SEC,
          );
          return challengeId;
        } catch {
          /* fall through to Map */
        }
      }
    }

    this.pruneChallenges();
    this.challenges.set(challengeId, { userId, expiresAt });
    return challengeId;
  }

  async setup(actor: AuthActor): Promise<MfaSetupResponse> {
    const user = await this.accounts.findById(actor.userId);
    if (!user) throw this.authRequired();
    if (user.totpEnabledAt) throw this.bad("MFA_ALREADY_ENABLED");

    const secret = this.generateSecret();
    await this.accounts.setTotpSecret(user.userId, secret);

    const recoveryCodes = this.generateRecoveryCodes();
    await this.accounts.replaceMfaRecoveryCodes(
      user.userId,
      recoveryCodes.map((code) => hashToken(this.normalizeRecovery(code))),
    );

    const label = user.email ?? user.displayName;
    const totp = new OTPAuth.TOTP({
      issuer: ISSUER,
      label,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    return {
      secret,
      otpauthUrl: totp.toString(),
      recoveryCodes,
    };
  }

  async confirm(actor: AuthActor, body: MfaConfirmRequest): Promise<MfaConfirmResponse> {
    const user = await this.accounts.findById(actor.userId);
    if (!user) throw this.authRequired();
    if (!user.totpSecret) throw this.bad("MFA_NOT_SETUP");
    if (user.totpEnabledAt) throw this.bad("MFA_ALREADY_ENABLED");
    if (!this.verifyToken(user.totpSecret, body.code)) {
      throw this.bad("MFA_INVALID_CODE");
    }
    const enabled = await this.accounts.enableTotp(user.userId);
    return {
      ok: true,
      profile: toProfile(enabled, authModeForUser(enabled)),
    };
  }

  async disable(actor: AuthActor, body: MfaDisableRequest): Promise<{ ok: true }> {
    const user = await this.accounts.findById(actor.userId);
    if (!user?.passwordHash) throw this.bad("NO_PASSWORD");
    if (!user.totpEnabledAt || !user.totpSecret) throw this.bad("MFA_NOT_ENABLED");
    const verified = await verifyPassword(body.password, user.passwordHash);
    if (!verified.valid) throw this.unauthorized("AUTH_INVALID");
    if (!this.verifyToken(user.totpSecret, body.code)) {
      throw this.bad("MFA_INVALID_CODE");
    }
    await this.accounts.disableTotp(user.userId);
    await this.accounts.revokeAllSessions(user.userId);
    return { ok: true };
  }

  async verifyChallenge(
    body: MfaVerifyRequest,
    reply: CookieReply,
    meta?: { ip?: string; userAgent?: string },
  ): Promise<AuthActionResponse> {
    const challengeId = body.challengeId.trim();
    const rateKey = `mfa:${meta?.ip ?? "unknown"}:${challengeId}`;
    if (!(await mfaVerifyRate.allow(rateKey))) {
      throw new HttpException(
        {
          type: "https://dang.local/problems/rate-limited",
          title: "Too many MFA attempts",
          status: 429,
          detail: "تعداد تلاش تأیید MFA زیاد است؛ کمی بعد دوباره امتحان کنید",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const challenge = await this.loadChallenge(challengeId);
    if (!challenge) {
      throw this.unauthorized("MFA_CHALLENGE_INVALID");
    }
    const user = await this.accounts.findById(challenge.userId);
    if (!user?.totpSecret || !user.totpEnabledAt) {
      throw this.unauthorized("MFA_CHALLENGE_INVALID");
    }

    let ok = false;
    if (body.code) {
      ok = this.verifyToken(user.totpSecret, body.code);
    } else if (body.recoveryCode) {
      ok = await this.consumeRecoveryCode(user.userId, body.recoveryCode);
    }
    if (!ok) throw this.unauthorized("MFA_INVALID_CODE");

    await this.deleteChallenge(challengeId);
    await this.accountService.issueSessionForUser(user.userId, reply, meta);
    return {
      ok: true,
      profile: toProfile(user, authModeForUser(user)),
      actor: toActor(user, authModeForUser(user)),
    };
  }

  private async loadChallenge(challengeId: string): Promise<MfaChallenge | null> {
    if (isRedisConfigured(loadAppEnv())) {
      const redis = await getRedisClient();
      if (redis) {
        try {
          const raw = await redis.get(`${MFA_CHALLENGE_REDIS_PREFIX}${challengeId}`);
          if (raw) {
            const parsed = JSON.parse(raw) as { userId?: string };
            if (typeof parsed.userId === "string" && parsed.userId) {
              return {
                userId: parsed.userId,
                expiresAt: Date.now() + MFA_CHALLENGE_TTL_MS,
              };
            }
          }
        } catch {
          /* fall through to Map */
        }
      }
    }

    this.pruneChallenges();
    const local = this.challenges.get(challengeId);
    if (!local || local.expiresAt <= Date.now()) {
      this.challenges.delete(challengeId);
      return null;
    }
    return local;
  }

  private async deleteChallenge(challengeId: string): Promise<void> {
    this.challenges.delete(challengeId);
    if (!isRedisConfigured(loadAppEnv())) return;
    const redis = await getRedisClient();
    if (!redis) return;
    try {
      await redis.del(`${MFA_CHALLENGE_REDIS_PREFIX}${challengeId}`);
    } catch {
      /* best-effort */
    }
  }

  private async consumeRecoveryCode(userId: string, raw: string): Promise<boolean> {
    const normalized = this.normalizeRecovery(raw);
    const hash = hashToken(normalized);
    const unused = await this.accounts.listUnusedMfaRecovery(userId);
    const match = unused.find((row) => row.codeHash === hash);
    if (!match) return false;
    await this.accounts.markMfaRecoveryUsed(match.id);
    return true;
  }

  private generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
      const hex = randomBytes(5).toString("hex");
      codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
    }
    return codes;
  }

  private normalizeRecovery(code: string): string {
    return code.trim().toLowerCase().replace(/\s+/g, "");
  }

  private pruneChallenges(): void {
    const now = Date.now();
    for (const [id, challenge] of this.challenges) {
      if (challenge.expiresAt <= now) this.challenges.delete(id);
    }
  }

  private authRequired(): UnauthorizedException {
    return new UnauthorizedException({
      type: "https://dang.local/problems/auth-required",
      title: "Authentication required",
      status: 401,
    });
  }

  private unauthorized(code: string): UnauthorizedException {
    const map: Record<string, { title: string; detail: string }> = {
      AUTH_INVALID: {
        title: "Invalid credentials",
        detail: "ایمیل یا رمز عبور نادرست است",
      },
      MFA_CHALLENGE_INVALID: {
        title: "Invalid MFA challenge",
        detail: "چالش MFA نامعتبر یا منقضی است",
      },
      MFA_INVALID_CODE: {
        title: "Invalid MFA code",
        detail: "کد تأیید نادرست است",
      },
    };
    const mapped = map[code] ?? { title: "Unauthorized", detail: code };
    return new UnauthorizedException({
      type: "https://dang.local/problems/auth",
      title: mapped.title,
      status: 401,
      detail: mapped.detail,
    });
  }

  private bad(code: string): BadRequestException {
    const map: Record<string, { title: string; detail: string }> = {
      MFA_ALREADY_ENABLED: {
        title: "MFA already enabled",
        detail: "احراز هویت دو مرحله‌ای از قبل فعال است",
      },
      MFA_NOT_SETUP: {
        title: "MFA not set up",
        detail: "ابتدا راه‌اندازی MFA را انجام دهید",
      },
      MFA_NOT_ENABLED: {
        title: "MFA not enabled",
        detail: "احراز هویت دو مرحله‌ای فعال نیست",
      },
      MFA_INVALID_CODE: {
        title: "Invalid MFA code",
        detail: "کد تأیید نادرست است",
      },
      NO_PASSWORD: {
        title: "No password",
        detail: "این حساب رمز محلی ندارد",
      },
    };
    const mapped = map[code] ?? { title: "Bad request", detail: code };
    return new BadRequestException({
      type: "https://dang.local/problems/validation",
      title: mapped.title,
      status: 400,
      detail: mapped.detail,
    });
  }
}
