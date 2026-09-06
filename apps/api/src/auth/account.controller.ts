import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActionResponse,
  AuthActor,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  MfaConfirmRequest,
  MfaConfirmResponse,
  MfaDisableRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  UserProfile,
} from "@dang/contracts";
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  mfaConfirmRequestSchema,
  mfaDisableRequestSchema,
  mfaVerifyRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  updateProfileRequestSchema,
  verifyEmailRequestSchema,
} from "@dang/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AuthGuard, CurrentActor } from "./auth.guard.js";
import { AccountService } from "./account.service.js";
import { MfaService } from "./mfa.service.js";
import { SESSION_COOKIE } from "./account.types.js";

@ApiTags("account")
@Controller("auth")
export class AccountController {
  constructor(
    @Inject(AccountService) private readonly accounts: AccountService,
    @Inject(MfaService) private readonly mfa: MfaService,
  ) {}

  @Post("register")
  @ApiOperation({ summary: "Register with email/password and start session cookie" })
  register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthActionResponse> {
    return this.accounts.register(body, reply, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  @Post("login")
  @ApiOperation({
    summary: "Login with email/password (may return MFA challenge without cookie)",
  })
  login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    return this.accounts.login(body, reply, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  @Post("logout")
  @ApiOperation({ summary: "Revoke session cookie" })
  logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    return this.accounts.logout(req.cookies?.[SESSION_COOKIE], reply);
  }

  @Post("forgot-password")
  @ApiOperation({ summary: "Request password reset (anti-enumeration)" })
  forgot(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> {
    return this.accounts.forgotPassword(body);
  }

  @Post("reset-password")
  @ApiOperation({ summary: "Reset password with one-time token" })
  reset(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthActionResponse> {
    return this.accounts.resetPassword(body, reply, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }

  @Get("profile")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Current user profile" })
  profile(@CurrentActor() actor: AuthActor): Promise<UserProfile> {
    return this.accounts.profile(actor);
  }

  @Patch("profile")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Update display name / locale / timezone" })
  updateProfile(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<UserProfile> {
    return this.accounts.updateProfile(actor, body);
  }

  @Post("change-password")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Change password and revoke other sessions" })
  changePassword(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<{ ok: true }> {
    return this.accounts.changePassword(actor, body);
  }

  @Post("revoke-sessions")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Revoke all sessions for current user (all devices)" })
  revokeSessions(@CurrentActor() actor: AuthActor): Promise<{ ok: true }> {
    return this.accounts.revokeAllSessions(actor);
  }

  @Post("verify-email")
  @ApiOperation({ summary: "Confirm email with one-time token" })
  verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: { token: string },
  ) {
    return this.accounts.verifyEmail(body.token);
  }

  @Post("resend-verification")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Resend email verification link" })
  resendVerification(@CurrentActor() actor: AuthActor) {
    return this.accounts.resendVerification(actor);
  }

  @Post("mfa/setup")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Begin TOTP enrollment; returns secret and recovery codes once" })
  mfaSetup(@CurrentActor() actor: AuthActor): Promise<MfaSetupResponse> {
    return this.mfa.setup(actor);
  }

  @Post("mfa/confirm")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Confirm TOTP with a live code to enable MFA" })
  mfaConfirm(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(mfaConfirmRequestSchema)) body: MfaConfirmRequest,
  ): Promise<MfaConfirmResponse> {
    return this.mfa.confirm(actor, body);
  }

  @Post("mfa/disable")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Disable MFA with password + TOTP code" })
  mfaDisable(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(mfaDisableRequestSchema)) body: MfaDisableRequest,
  ): Promise<{ ok: true }> {
    return this.mfa.disable(actor, body);
  }

  @Post("mfa/verify")
  @ApiOperation({ summary: "Complete MFA challenge after password login; sets session cookie" })
  mfaVerify(
    @Body(new ZodValidationPipe(mfaVerifyRequestSchema)) body: MfaVerifyRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthActionResponse> {
    return this.mfa.verifyChallenge(body, reply, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
  }
}
