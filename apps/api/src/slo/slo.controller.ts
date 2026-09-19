import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { AuthActor } from "@dang/contracts";
import { AuthGuard, CurrentActor } from "../auth/auth.guard.js";
import { SloService } from "./slo.service.js";

@ApiTags("platform")
@Controller("platform")
@UseGuards(AuthGuard)
export class SloController {
  constructor(@Inject(SloService) private readonly slo: SloService) {}

  @Get("slo")
  getSlo(@CurrentActor() actor: AuthActor) {
    return this.slo.snapshot(actor);
  }
}
