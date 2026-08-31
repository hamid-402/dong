import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, AuthMeResponse, SessionSummary } from "@dang/contracts";
import { loadAppEnv } from "@dang/config";
import { AuthGuard, CurrentActor } from "./auth.guard.js";
import { IAM_STORE, type IamStore } from "../iam/iam.types.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(IAM_STORE) private readonly iam: IamStore) {}

  @Get("session")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "Browser session summary (dev headers until OIDC + cookie)",
  })
  @ApiHeader({ name: "x-dang-subject", required: false })
  session(@CurrentActor() actor: AuthActor): SessionSummary {
    const env = loadAppEnv();
    return {
      authenticated: true,
      mode: env.allowDevAuth ? "dev" : "oidc",
      actor,
    };
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
    return {
      actor,
      workspaces: await this.iam.listWorkspacesForUser(actor.userId),
    };
  }
}
