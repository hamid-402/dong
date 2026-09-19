// Zod: POST bodies validated via ZodValidationPipe (confirm string).
import { Body, Controller, Delete, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import type { AuthActor } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import {
  COLLEAGUES_PURGE_CONFIRM,
  COLLEAGUES_SEED_CONFIRM,
  AFTAB_PURGE_CONFIRM,
  WORKSPACE_SEED_CONFIRM,
  DemoSeedService,
  type ColleaguesDemoPurgeResult,
  type ColleaguesDemoSeedResult,
  type DemoSeedResult,
} from "./demo-seed.service.js";

const workspaceSeedBodySchema = z
  .object({
    confirm: z.literal(WORKSPACE_SEED_CONFIRM),
  })
  .strict();

const colleaguesSeedBodySchema = z
  .object({
    confirm: z.literal(COLLEAGUES_SEED_CONFIRM),
  })
  .strict();

const colleaguesPurgeBodySchema = z
  .object({
    confirm: z.literal(COLLEAGUES_PURGE_CONFIRM),
  })
  .strict();

const aftabPurgeBodySchema = z
  .object({
    confirm: z.literal(AFTAB_PURGE_CONFIRM),
  })
  .strict();

@ApiTags("demo")
@Controller("demo")
@UseGuards(AuthGuard)
export class DemoController {
  constructor(
    @Inject(DemoSeedService) private readonly demoSeed: DemoSeedService,
  ) {}

  @Post("seed")
  @ApiOperation({
    summary: "Bootstrap a demo workspace (dev auth only) — explicit confirm required",
  })
  @ApiOkResponse({ description: "Demo workspace ready" })
  bootstrap(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(workspaceSeedBodySchema))
    body: z.infer<typeof workspaceSeedBodySchema>,
  ): Promise<DemoSeedResult> {
    return this.demoSeed.seed(actor, body);
  }

  @Post("seed/colleagues")
  @ApiOperation({
    summary: "Seed colleagues scenario (دمو) — explicit confirm required",
  })
  @ApiOkResponse({ description: "Colleagues demo workspace ready" })
  seedColleagues(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(colleaguesSeedBodySchema))
    body: z.infer<typeof colleaguesSeedBodySchema>,
  ): Promise<ColleaguesDemoSeedResult> {
    return this.demoSeed.seedColleagues(actor, body);
  }

  @Delete("seed/colleagues")
  @ApiOperation({
    summary: "Purge tagged colleagues demo rows — explicit confirm required",
  })
  @ApiOkResponse({ description: "Colleagues demo purged" })
  purgeColleagues(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(colleaguesPurgeBodySchema))
    body: z.infer<typeof colleaguesPurgeBodySchema>,
  ): Promise<ColleaguesDemoPurgeResult> {
    return this.demoSeed.purgeColleagues(actor, body);
  }

  @Delete("seed/aftab")
  @ApiOperation({
    summary: "Purge «پروژه آفتاب» demo workspace — explicit confirm required",
  })
  @ApiOkResponse({ description: "Aftab demo purged" })
  purgeAftab(
    @CurrentActor() actor: AuthActor,
    @Body(new ZodValidationPipe(aftabPurgeBodySchema))
    body: z.infer<typeof aftabPurgeBodySchema>,
  ): Promise<ColleaguesDemoPurgeResult> {
    return this.demoSeed.purgeAftab(actor, body);
  }
}
