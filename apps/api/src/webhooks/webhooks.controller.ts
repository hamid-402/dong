import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthActor, CreateWorkspaceWebhookRequest } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { WebhooksService } from "./webhooks.service.js";

const createWebhookSchema = z
  .object({
    workspaceId: z.string().uuid(),
    url: z.string().url().max(2048),
    events: z
      .array(z.enum(["expense.posted", "settlement.confirmed"]))
      .min(1)
      .max(8),
    secret: z.string().min(16).max(256),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

@ApiTags("webhooks")
@Controller("workspaces/:workspaceId/webhooks")
@UseGuards(AuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  list(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.webhooks.list(actor, workspaceId);
  }

  @Post()
  create(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(createWebhookSchema)) body: CreateWorkspaceWebhookRequest,
  ) {
    return this.webhooks.create(actor, workspaceId, { ...body, workspaceId });
  }

  @Post(":webhookId/deactivate")
  deactivate(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Param("webhookId") webhookId: string,
  ) {
    return this.webhooks.deactivate(actor, workspaceId, webhookId);
  }
}
