import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, CreateReportViewRequest, ReportViewSummary } from "@dang/contracts";
import { createReportViewRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { REPORT_VIEWS_STORE, type ReportViewsStore } from "./report-views.types.js";

@ApiTags("report-views")
@Controller("me/report-views")
@UseGuards(AuthGuard)
export class ReportViewsController {
  constructor(@Inject(REPORT_VIEWS_STORE) private readonly views: ReportViewsStore) {}

  @Get()
  @ApiOperation({ summary: "List saved cross-workspace report views" })
  list(@CurrentActor() actor: AuthActor): Promise<ReportViewSummary[]> {
    return this.views.list(actor.userId);
  }

  @Post()
  @ApiOperation({ summary: "Create a saved report view preset" })
  create(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(createReportViewRequestSchema))
    body: CreateReportViewRequest,
  ): Promise<ReportViewSummary> {
    return this.views.create(actor.userId, body);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a saved report view" })
  async remove(
    @CurrentActor() actor: AuthActor,
    @Param("id") id: string,
  ): Promise<{ deleted: true }> {
    const ok = await this.views.delete(actor.userId, id);
    if (!ok) throw new NotFoundException({ detail: "نمای ذخیره‌شده پیدا نشد" });
    return { deleted: true };
  }
}
