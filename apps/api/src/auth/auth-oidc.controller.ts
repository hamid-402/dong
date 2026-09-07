// Zod body-validation exempt: GET/body-less OIDC redirect + status controller. See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Get, Inject, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { isOidcConfigured, loadAppEnv } from "@dang/config";
import type { OidcStatusResponse } from "@dang/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";
import { OidcService } from "./oidc.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthOidcController {
  constructor(@Inject(OidcService) private readonly oidc: OidcService) {}

  @Get("oidc/status")
  @ApiOperation({
    summary: "Whether OIDC is configured (no secrets returned)",
  })
  status(): OidcStatusResponse {
    const env = loadAppEnv();
    return {
      configured: isOidcConfigured(env),
      allowDevAuth: env.allowDevAuth,
      issuerConfigured: Boolean(env.oidcIssuerUrl),
      clientIdConfigured: Boolean(env.oidcClientId),
    };
  }

  @Get("oidc/login")
  @ApiOperation({ summary: "Redirect to OIDC provider (Authorization Code + PKCE)" })
  async login(@Res() reply: FastifyReply): Promise<void> {
    const url = await this.oidc.startLogin();
    await reply.redirect(url);
  }

  @Get("oidc/callback")
  @ApiOperation({ summary: "OIDC callback — creates session cookie and redirects to web" })
  async callback(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const redirect = await this.oidc.handleCallback(req, reply);
    await reply.redirect(redirect);
  }
}
