import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  updateNotificationPreferenceSchema,
  updateUiPreferenceSchema,
  updateWorkspacePlanSchema,
  verifyInternalJobAuth,
  INTERNAL_DIGEST_ACTOR_USER_ID,
  INTERNAL_DIGEST_WORKSPACE_ID,
  type AuthActor,
  type UpdateNotificationPreferenceRequest,
  type UpdateUiPreferenceRequest,
} from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { KeyVaultService } from "../key-vault/key-vault.service.js";
import { WaveFSettingsService } from "./wave-f-settings.service.js";

@Controller()
export class WaveFSettingsController {
  constructor(
    @Inject(WaveFSettingsService) private readonly service: WaveFSettingsService,
    @Inject(KeyVaultService) private readonly vault: KeyVaultService,
  ) {}

  @Get("me/notification-prefs")
  @UseGuards(AuthGuard)
  getPref(@CurrentActor() a: AuthActor) {
    return this.service.getPref(a.userId);
  }

  @Put("me/notification-prefs")
  @UseGuards(AuthGuard)
  putPref(
    @CurrentActor() a: AuthActor,
    @Body(new ZodValidationPipe(updateNotificationPreferenceSchema))
    b: UpdateNotificationPreferenceRequest,
  ) {
    return this.service.putPref(a.userId, b);
  }

  @Get("me/ui-prefs")
  @UseGuards(AuthGuard)
  getUiPref(@CurrentActor() a: AuthActor) {
    return this.service.getUiPref(a.userId);
  }

  @Put("me/ui-prefs")
  @UseGuards(AuthGuard)
  putUiPref(
    @CurrentActor() a: AuthActor,
    @Body(new ZodValidationPipe(updateUiPreferenceSchema)) b: UpdateUiPreferenceRequest,
  ) {
    return this.service.putUiPref(a.userId, b);
  }

  @Get("workspaces/:workspaceId/plan")
  @UseGuards(AuthGuard)
  getPlan(@CurrentActor() a: AuthActor, @Param("workspaceId") w: string) {
    return this.service.getPlan(a, w);
  }

  @Put("workspaces/:workspaceId/plan")
  @UseGuards(AuthGuard)
  putPlan(
    @CurrentActor() a: AuthActor,
    @Param("workspaceId") w: string,
    @Body(new ZodValidationPipe(updateWorkspacePlanSchema))
    b: {
      plan: "free" | "pro" | "business";
      seatsLimit?: number | null;
      features?: string[];
    },
  ) {
    return this.service.putPlan(a, w, b);
  }

  @Post("system/digest/weekly-tick")
  async tick(
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
      workspace !== INTERNAL_DIGEST_WORKSPACE_ID ||
      actor !== INTERNAL_DIGEST_ACTOR_USER_ID
    ) {
      throw new ForbiddenException({
        type: "https://dang.local/problems/forbidden",
        title: "Internal job auth failed",
        status: 403,
      });
    }
    return this.service.weeklyTick();
  }
}
