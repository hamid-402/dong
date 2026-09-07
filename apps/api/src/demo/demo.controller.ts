// Zod body-validation exempt: body-less POST (actor-scoped seed, no request body). See docs/adr/ADR-zod-get-exemptions.md
import { Controller, Inject, Post, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { AuthActor } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { DemoSeedService, type DemoSeedResult } from "./demo-seed.service.js";

@ApiTags("demo")
@Controller("demo")
@UseGuards(AuthGuard)
export class DemoController {
  constructor(
    @Inject(DemoSeedService) private readonly demoSeed: DemoSeedService,
  ) {}

  @Post("seed")
  @ApiOperation({ summary: "Bootstrap a demo workspace (dev auth only)" })
  @ApiOkResponse({ description: "Demo workspace ready" })
  bootstrap(@CurrentActor() actor: AuthActor): Promise<DemoSeedResult> {
    return this.demoSeed.seed(actor);
  }
}
