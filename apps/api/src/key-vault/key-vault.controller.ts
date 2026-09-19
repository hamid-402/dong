import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthActor, VaultStatusResponse } from "@dang/contracts";
import { REAUTH_COOKIE } from "@dang/contracts";
import type { FastifyRequest } from "fastify";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { AccountService } from "../auth/account.service.js";
import {
  ACCOUNT_STORE,
  type AccountStore,
} from "../auth/account.types.js";
import { MfaService } from "../auth/mfa.service.js";
import { KeyVaultService } from "./key-vault.service.js";

function hideNotFound(): never {
  throw new NotFoundException({
    type: "https://dang.local/problems/not-found",
    title: "Not Found",
    status: 404,
    detail: "Not Found",
  });
}

@ApiTags("vault")
@Controller("vault")
@UseGuards(AuthGuard)
export class KeyVaultController {
  constructor(
    @Inject(KeyVaultService) private readonly vault: KeyVaultService,
    @Inject(ACCOUNT_STORE) private readonly accounts: AccountStore,
    @Inject(AccountService) private readonly accountService: AccountService,
    @Optional() @Inject(MfaService) private readonly mfa?: MfaService,
  ) {}

  private async requireOwner(actor: AuthActor) {
    const user = await this.accounts.findById(actor.userId);
    if (!user || user.disabledAt || user.platformRole !== "platform_owner") {
      hideNotFound();
    }
    return user;
  }

  /** Reauth cookie + MFA enrollment for platform_owner vault mutations (G01 depth). */
  private async requireStepUp(actor: AuthActor, req: FastifyRequest) {
    this.accountService.assertRecentReauth(actor, req.cookies?.[REAUTH_COOKIE]);
    if (this.mfa) {
      await this.mfa.assertMfaEnrolledForSensitiveAction(actor.userId);
    }
  }

  @Get("status")
  async status(@CurrentActor() actor: AuthActor): Promise<VaultStatusResponse> {
    await this.requireOwner(actor);
    return this.vault.status();
  }

  @Post("seal")
  async seal(
    @CurrentActor() actor: AuthActor,
    @Req() req: FastifyRequest,
  ): Promise<VaultStatusResponse> {
    await this.requireOwner(actor);
    await this.requireStepUp(actor, req);
    return this.vault.seal();
  }

  @Post("unseal")
  async unseal(
    @CurrentActor() actor: AuthActor,
    @Req() req: FastifyRequest,
  ): Promise<VaultStatusResponse> {
    await this.requireOwner(actor);
    await this.requireStepUp(actor, req);
    return this.vault.unseal();
  }

  @Post("rotate/:name")
  async rotateSecret(
    @CurrentActor() actor: AuthActor,
    @Param("name") name: string,
    @Req() req: FastifyRequest,
  ) {
    await this.requireOwner(actor);
    await this.requireStepUp(actor, req);
    return this.vault.rotate(decodeURIComponent(name));
  }

  @Post("rotate-master")
  async rotateMaster(
    @CurrentActor() actor: AuthActor,
    @Req() req: FastifyRequest,
  ) {
    await this.requireOwner(actor);
    await this.requireStepUp(actor, req);
    return this.vault.rotateMasterKey();
  }
}
