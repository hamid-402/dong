import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type {
  AuthActionResponse,
  AuthActor,
  AccountDataExport,
  AccountSessionSummary,
  ChangeEmailRequest,
  ChangeEmailResponse,
  ChangePasswordRequest,
  ClaimUsernameRequest,
  DeleteAccountRequest,
  DeleteAccountResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  MfaConfirmRequest,
  MfaConfirmResponse,
  MfaDisableRequest,
  MfaSetupResponse,
  MfaVerifyRequest,
  ReauthRequest,
  ReauthResponse,
  RegisterRequest,
  ResetPasswordRequest,
  UpdateProfileRequest,
  UserProfile,
  UsernameAvailableResponse,
} from "@dang/contracts";
import {
  changeEmailRequestSchema,
  changePasswordRequestSchema,
  claimUsernameRequestSchema,
  deleteAccountRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  mfaConfirmRequestSchema,
  mfaDisableRequestSchema,
  mfaVerifyRequestSchema,
  reauthRequestSchema,
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
import { REAUTH_COOKIE } from "@dang/contracts";

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
    summary: "Login with email, username, or phone + password (may return MFA challenge)",
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

  @Get("username-available")
  @ApiOperation({ summary: "Check whether a username is available (rate-limited)" })
  usernameAvailable(
    @Query("username") username: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<UsernameAvailableResponse> {
    return this.accounts.usernameAvailable(username ?? "", { ip: req.ip }, reply);
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
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ForgotPasswordResponse> {
    return this.accounts.forgotPassword(body, reply);
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
  @ApiOperation({ summary: "Update profile, username, phone, or display unit" })
  updateProfile(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<UserProfile> {
    return this.accounts.updateProfile(actor, body);
  }

  @Post("email/change")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Change email with current password; requires re-verification" })
  changeEmail(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(changeEmailRequestSchema)) body: ChangeEmailRequest,
  ): Promise<ChangeEmailResponse> {
    return this.accounts.changeEmail(actor, body);
  }

  @Post("username/claim")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Claim a username for legacy accounts that have none" })
  claimUsername(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(claimUsernameRequestSchema)) body: ClaimUsernameRequest,
  ): Promise<UserProfile> {
    return this.accounts.claimUsername(actor, body);
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

  @Get("sessions")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "List active sessions for the current account" })
  listSessions(
    @CurrentActor() actor: AuthActor,
    @Req() req: FastifyRequest,
  ): Promise<AccountSessionSummary[]> {
    return this.accounts.listSessions(actor, req.cookies?.[SESSION_COOKIE]);
  }

  @Post("reauth")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Step-up password reauth; sets short-lived dang_reauth cookie",
  })
  reauth(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(reauthRequestSchema)) body: ReauthRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<ReauthResponse> {
    return this.accounts.reauth(actor, body, reply, { ip: req.ip });
  }

  @Get("me/data-export")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Export account profile + workspace memberships (R10-14; requires reauth + MFA if sensitive)",
  })
  exportMyData(
    @CurrentActor() actor: AuthActor,
    @Req() req: FastifyRequest,
  ): Promise<AccountDataExport> {
    return this.accounts.exportMyData(
      actor,
      req.cookies?.[SESSION_COOKIE],
      req.cookies?.[REAUTH_COOKIE],
    );
  }

  @Post("me/delete-account")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Anonymize account PII and revoke sessions (requires reauth + password)",
  })
  deleteMyAccount(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(deleteAccountRequestSchema)) body: DeleteAccountRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DeleteAccountResponse> {
    return this.accounts.deleteMyAccount(
      actor,
      body,
      reply,
      req.cookies?.[REAUTH_COOKIE],
    );
  }

  @Delete("sessions/:sessionId")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Revoke one active session owned by the current account" })
  async revokeSession(
    @CurrentActor() actor: AuthActor,
    @Param("sessionId") sessionId: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true; currentRevoked: boolean }> {
    const rawToken = req.cookies?.[SESSION_COOKIE];
    const result = await this.accounts.revokeSession(actor, sessionId, rawToken);
    if (result.currentRevoked) {
      await this.accounts.logout(rawToken, reply);
    }
    return result;
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
