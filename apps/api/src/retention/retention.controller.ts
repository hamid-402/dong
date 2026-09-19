import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  INTERNAL_RETENTION_ACTOR_USER_ID,
  INTERNAL_RETENTION_WORKSPACE_ID,
  verifyInternalJobAuth,
  type AuthActor,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ACCOUNT_STORE, type AccountStore } from "../auth/account.types.js";
import { KeyVaultService } from "../key-vault/key-vault.service.js";
import { RetentionService } from "./retention.service.js";

function hideNotFound(): never {
  throw new NotFoundException({
    type: "https://dang.local/problems/not-found",
    title: "Not Found",
    status: 404,
    detail: "Not Found",
  });
}

@ApiTags("retention")
@Controller()
export class RetentionController {
  constructor(
    @Inject(RetentionService) private readonly retention: RetentionService,
    @Inject(KeyVaultService) private readonly vault: KeyVaultService,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
  ) {}

  @Get("system/retention/dry-run")
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Preview retention purge counts (platform ops, no mutation)" })
  async dryRun(@CurrentActor() actor: AuthActor) {
    const user = await this.accounts.findById(actor.userId);
    if (!user || user.disabledAt) hideNotFound();
    if (
      user.platformRole !== "platform_owner" &&
      user.platformRole !== "platform_support"
    ) {
      hideNotFound();
    }
    return this.retention.previewPurge();
  }

  @Post("system/retention/purge")
  @ApiOperation({
    summary: "Internal retention sweep (statements expiry + old blocked attachment blobs)",
  })
  async purge(
    @Headers("x-dang-internal-job") token?: string,
    @Headers("x-dang-internal-actor-user-id") actor?: string,
    @Headers("x-dang-internal-workspace-id") workspace?: string,
    @Headers("x-dang-internal-ts") tsRaw?: string,
    @Headers("x-dang-internal-sig") sig?: string,
  ) {
    const secrets = await this.vault.resolveInternalJobSecrets();
    const ts = Number(tsRaw);
    if (
      secrets.length === 0 ||
      !token ||
      !actor ||
      !workspace ||
      !sig ||
      !verifyInternalJobAuth({
        secrets,
        suppliedToken: token,
        ts,
        workspaceId: workspace,
        actorUserId: actor,
        signature: sig,
      }) ||
      workspace !== INTERNAL_RETENTION_WORKSPACE_ID ||
      actor !== INTERNAL_RETENTION_ACTOR_USER_ID
    ) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Internal job auth failed",
        status: 403,
      });
    }
    return this.retention.runPurge();
  }
}
