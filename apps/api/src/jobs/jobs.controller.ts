import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor, RunJobRequest } from "@dang/contracts";
import { runJobRequestSchema } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { JobsService, type JobRunResult } from "./jobs.service.js";

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

  @Get()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: "Recent job runs (dev)" })
  list(@CurrentActor() actor: AuthActor): JobRunResult[] {
    void actor;
    return this.jobs.listRecent();
  }
}
