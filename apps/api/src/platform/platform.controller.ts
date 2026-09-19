import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthActor } from "@dang/contracts";
import { z } from "zod";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PlatformService } from "./platform.service.js";

const roleBodySchema = z
  .object({
    platformRole: z.enum(["user", "platform_support", "platform_owner"]),
    confirmPendingId: z.string().uuid().optional(),
  })
  .strict();

const disableBodySchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .strict();

const breakGlassBodySchema = z
  .object({
    workspaceId: z.string().uuid(),
    reason: z.string().min(8).max(2000),
    expiresInMinutes: z.number().int().min(1).max(240),
    ticketRef: z.string().max(200).optional(),
  })
  .strict();

@ApiTags("platform")
@Controller("platform")
@UseGuards(AuthGuard)
export class PlatformController {
  constructor(@Inject(PlatformService) private readonly platform: PlatformService) {}

  @Get("users")
  listUsers(
    @CurrentActor() actor: AuthActor,
    @Query("q") q?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.platform.listUsers(actor, { q, cursor });
  }

  @Patch("users/:uid/role")
  setRole(
    @CurrentActor() actor: AuthActor,
    @Param("uid") uid: string,
    @Body(new ZodValidationPipe(roleBodySchema))
    body: z.infer<typeof roleBodySchema>,
  ) {
    return this.platform.setUserRole(actor, uid, body);
  }

  @Post("users/:uid/password-reset")
  passwordReset(@CurrentActor() actor: AuthActor, @Param("uid") uid: string) {
    return this.platform.triggerPasswordReset(actor, uid);
  }

  @Post("users/:uid/disable")
  disable(
    @CurrentActor() actor: AuthActor,
    @Param("uid") uid: string,
    @Body(new ZodValidationPipe(disableBodySchema))
    body: z.infer<typeof disableBodySchema>,
  ) {
    return this.platform.disableUser(actor, uid, body);
  }

  @Get("flags")
  flags(@CurrentActor() actor: AuthActor) {
    return this.platform.getFlags(actor);
  }

  @Get("security-events")
  securityEvents(
    @CurrentActor() actor: AuthActor,
    @Query("cursor") cursor?: string,
    @Query("category") category?: string,
    @Query("severity") severity?: string,
  ) {
    return this.platform.listSecurityEvents(actor, { cursor, category, severity });
  }

  @Get("outbox/stats")
  outboxStats(@CurrentActor() actor: AuthActor) {
    return this.platform.getOutboxStats(actor);
  }

  @Post("outbox/redrive")
  outboxRedrive(
    @CurrentActor() actor: AuthActor,
    @Query("limit") limit?: string,
  ) {
    const n = limit ? Number(limit) : 25;
    return this.platform.redriveOutbox(actor, Number.isFinite(n) ? n : 25);
  }

  @Post("break-glass")
  openBreakGlass(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(breakGlassBodySchema))
    body: z.infer<typeof breakGlassBodySchema>,
  ) {
    return this.platform.openBreakGlass(actor, body);
  }

  @Post("break-glass/:bid/revoke")
  revokeBreakGlass(@CurrentActor() actor: AuthActor, @Param("bid") bid: string) {
    return this.platform.revokeBreakGlass(actor, bid);
  }

  @Get("break-glass")
  listBreakGlass(@CurrentActor() actor: AuthActor, @Query("cursor") cursor?: string) {
    return this.platform.listBreakGlass(actor, cursor);
  }
}
