import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { isOidcConfigured, loadAppEnv } from "@dang/config";
import type { OidcStatusResponse } from "@dang/contracts";

@ApiTags("auth")
@Controller("auth")
export class AuthOidcController {
  @Get("oidc/status")
  @ApiOperation({
    summary: "Whether OIDC is configured (no secrets returned)",
  })
  @ApiOkResponse({
    schema: {
      example: {
        configured: false,
        allowDevAuth: true,
        issuerConfigured: false,
        clientIdConfigured: false,
      },
    },
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
}
