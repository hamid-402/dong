import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, RunJobRequest } from "@dang/contracts";
import { runJobRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { JobsService, type DlqListResult, type JobRunResult } from "./jobs.service.js";

@ApiTags("jobs")
@Controller("workspaces/:workspaceId/jobs")
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Post()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Run background job in-process (dev)" })
  run(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Body(new ZodValidationPipe(runJobRequestSchema)) body: RunJobRequest,
  ): JobRunResult {
    void actor;
    return this.jobs.run(body.name, workspaceId);
  }

  @Get("dlq")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary: "List Redis job dead-letter queue (owner/admin; requires Redis)",
  })
  listDlq(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
    @Query("limit") limit?: string,
  ): Promise<DlqListResult> {
    const n = limit ? Number(limit) : 50;
    return this.jobs.listDlq(actor, workspaceId, Number.isFinite(n) ? n : 50);
  }

  @Post("dlq/replay")
  @UseGuards(AuthGuard)
  @ApiOperation({
    summary:
      "Replay one DLQ item (RPOP → LPUSH main queue). Owner/admin; requires Redis.",
  })
  replayDlq(
    @CurrentActor() actor: AuthActor,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.jobs.replayDlq(actor, workspaceId);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Recent job runs (dev)" })
  list(@CurrentActor() actor: AuthActor): JobRunResult[] {
    void actor;
    return this.jobs.listRecent();
  }
}
