import {
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, AuthMeResponse, SessionSummary } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthGuard, CurrentActor } from "./auth.guard.js";
import { AccountService } from "./account.service.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(IAM_STORE) private readonly iam: IamStore,
    @Inject(AccountService) private readonly accounts: AccountService,
  ) {}

  @Get("session")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Browser session summary (dev headers until OIDC + cookie)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  session(@CurrentActor() actor: AuthActor): SessionSummary {
    return {
      authenticated: true,
      mode: actor.authMode,
      actor,
    };
  }

  /**
   * Issues a real HttpOnly dang_session for local DevAuth so middleware
   * no longer relies on the forgeable dang_web_session flag.
   */
  @Post("dev/bootstrap-session")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Dev-only: mint HttpOnly session from DevAuth headers" })
  async bootstrapDevSession(
    @CurrentActor() actor: AuthActor,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ ok: true }> {
    const env = loadAppEnv();
    if (env.nodeEnv === "production" || !env.allowDevAuth) {
      throw new NotFoundException({
        type: "https://dang.local/problems/not-found",
        title: "Not found",
        status: 404,
      });
    }
    await this.accounts.issueSessionForUser(actor.userId, reply, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    return { ok: true };
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Current actor and workspaces (dev auth until OIDC is wired)",
  })
  @ApiHeader({
    name: "x-dang-subject",
    required: false,
    description: "Dev-only external subject. Defaults to dev-local-user.",
  })
  @ApiHeader({
    name: "x-dang-display-name",
    required: false,
  })
  @ApiOkResponse({
    schema: {
      example: {
        actor: {
          userId: "00000000-0000-4000-8000-000000000001",
          externalSubject: "dev-local-user",
          displayName: "کاربر محلی",
          authMode: "dev",
        },
        workspaces: [],
      },
    },
  })
  async me(@CurrentActor() actor: AuthActor): Promise<AuthMeResponse> {
    const profile = await this.accounts.profile(actor).catch(() => null);
    return {
      actor,
      workspaces: await this.iam.listWorkspacesForUser(actor.userId),
      displayUnit: profile?.displayUnit ?? null,
      platformRole: profile?.platformRole ?? "user",
    };
  }
}
